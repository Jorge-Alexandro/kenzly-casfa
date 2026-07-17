// Datos para el MAPA IMPRIMIBLE de una parcela (entregable estilo MAYACERT):
// polígono sobre satélite, coordenadas de los vértices, colindancias N/S/E/O,
// pendiente, superficie total/cultivada y estatus de certificación.
import { createClient } from '@/lib/supabase/server'
import type { NivelCertificacion } from '@/lib/types'

export interface MapaParcela {
  parcela: {
    id: string
    codigo_parcela: string
    nombre: string | null
    comunidad: string | null
    municipio: string | null
    superficie_total_ha: number | null
    superficie_cultivada_ha: number | null
  }
  productor: { nombre_completo: string; codigo: string }
  estatus_nivel: NivelCertificacion | null
  estatus_anio: number | null
  // Anillo exterior del polígono como [lng, lat][]; null si no tiene polígono.
  vertices: [number, number][] | null
  geojson: GeoJSON.Polygon | null
  colindancias: { norte: string; sur: string; este: string; oeste: string }
  pendiente: string | null
}

export async function getMapaParcela(parcelaId: string): Promise<MapaParcela | null> {
  const supabase = await createClient()

  const { data: parcela } = await supabase
    .from('parcelas')
    .select(
      `id, codigo_parcela, nombre, comunidad, municipio, superficie_declarada_ha, productor_id,
       parcela_cafe ( superficie_arabica_ha, superficie_robusta_ha )`,
    )
    .eq('id', parcelaId)
    .maybeSingle()
  if (!parcela) return null

  const { data: prod } = await supabase
    .from('productores')
    .select('nombre_completo, codigo')
    .eq('id', parcela.productor_id)
    .maybeSingle()

  // Estatus de certificación vigente (año más reciente).
  const { data: est } = await supabase
    .from('certificacion_estatus')
    .select('anio, nivel')
    .eq('productor_id', parcela.productor_id)
    .order('anio', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Polígono activo (geojson vía RPC; filtramos por esta parcela).
  const { data: polys } = await supabase.rpc('get_parcela_polygons')
  const row = (polys ?? []).find(
    (r: { parcela_id: string }) => r.parcela_id === parcelaId,
  ) as { geojson: GeoJSON.Polygon } | undefined
  const geojson = row?.geojson ?? null
  const vertices = geojson ? (geojson.coordinates[0] as [number, number][]) : null

  // Colindancias y pendiente: de la ficha más reciente de la parcela.
  const { data: fp } = await supabase
    .from('ficha_parcelas')
    .select('ficha_id, fichas ( respuestas, created_at )')
    .eq('parcela_id', parcelaId)
  const fichas = (fp ?? [])
    .map((x) => (Array.isArray(x.fichas) ? x.fichas[0] : x.fichas))
    .filter(Boolean)
    .sort((a, b) => String(b?.created_at).localeCompare(String(a?.created_at)))
  const resp = (fichas[0]?.respuestas ?? {}) as Record<string, unknown>
  const str = (k: string) => (typeof resp[k] === 'string' ? (resp[k] as string) : '')

  const cafe = Array.isArray(parcela.parcela_cafe) ? parcela.parcela_cafe[0] : parcela.parcela_cafe
  const cultivada =
    (Number(cafe?.superficie_arabica_ha) || 0) + (Number(cafe?.superficie_robusta_ha) || 0)

  return {
    parcela: {
      id: parcela.id,
      codigo_parcela: parcela.codigo_parcela,
      nombre: parcela.nombre,
      comunidad: parcela.comunidad,
      municipio: parcela.municipio,
      superficie_total_ha: parcela.superficie_declarada_ha,
      superficie_cultivada_ha: cultivada > 0 ? cultivada : null,
    },
    productor: {
      nombre_completo: prod?.nombre_completo ?? '',
      codigo: prod?.codigo ?? '',
    },
    estatus_nivel: (est?.nivel ?? null) as NivelCertificacion | null,
    estatus_anio: est?.anio ?? null,
    vertices,
    geojson,
    colindancias: {
      norte: str('colinda_norte'),
      sur: str('colinda_sur'),
      este: str('colinda_este'),
      oeste: str('colinda_oeste'),
    },
    pendiente: str('pendiente') || null,
  }
}
