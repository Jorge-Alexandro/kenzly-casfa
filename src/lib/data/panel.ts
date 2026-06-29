// Server-side aggregation for the coordination dashboard (Panel).
// Reúne KPIs de los cinco módulos en una sola pasada para el coordinador.
import { createClient } from '@/lib/supabase/server'
import { getParcelasGeo } from '@/lib/data/geosic'
import { calcularStats } from '@/lib/types'
import type { EstadoFicha } from '@/lib/types'

export interface PanelStats {
  // catálogos
  productores: number
  parcelas: number
  hectareas: number
  // geo
  con_poligono: number
  validadas: number
  diferencia_critica: number
  sin_poligono: number
  // fichas por estado
  fichas_total: number
  fichas_por_estado: Record<EstadoFicha, number>
  // expediente
  bitacoras: number
  historiales: number
}

const ESTADOS: EstadoFicha[] = [
  'borrador',
  'en_revision',
  'aprobada',
  'pdf_generado',
  'requiere_correccion',
]

export async function getPanelStats(): Promise<PanelStats> {
  const supabase = await createClient()

  // Parcelas + geo (reutiliza el RPC del mapa) y la suma de hectáreas.
  const parcelasGeo = await getParcelasGeo()
  const geo = calcularStats(parcelasGeo)
  const hectareas = parcelasGeo.reduce(
    (s, p) => s + (Number(p.superficie_declarada_ha) || 0),
    0,
  )

  // Conteos con head+count (no traen filas).
  const [productores, fichasEstados, bitacoras, historiales] = await Promise.all([
    supabase.from('productores').select('id', { count: 'exact', head: true }),
    supabase.from('fichas').select('estado'),
    supabase.from('bitacora_anual').select('id', { count: 'exact', head: true }),
    supabase.from('historial_manejo_anual').select('id', { count: 'exact', head: true }),
  ])

  // Tally de fichas por estado.
  const fichas_por_estado = Object.fromEntries(
    ESTADOS.map((e) => [e, 0]),
  ) as Record<EstadoFicha, number>
  for (const f of fichasEstados.data ?? []) {
    const e = f.estado as EstadoFicha
    if (e in fichas_por_estado) fichas_por_estado[e]++
  }
  const fichas_total = (fichasEstados.data ?? []).length

  return {
    productores: productores.count ?? 0,
    parcelas: geo.total,
    hectareas,
    con_poligono: geo.con_poligono,
    validadas: geo.validadas,
    diferencia_critica: geo.diferencia_critica,
    sin_poligono: geo.sin_poligono,
    fichas_total,
    fichas_por_estado,
    bitacoras: bitacoras.count ?? 0,
    historiales: historiales.count ?? 0,
  }
}
