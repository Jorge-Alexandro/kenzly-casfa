// Server-side data access for the Productores module (detail + edit).
// All queries run under RLS (org isolation enforced by Postgres).
import { createClient } from '@/lib/supabase/server'
import type { ProductorDetalle, ParcelaDetalle, Productor } from '@/lib/types'

// Productor + all its parcelas (with productive extension and active polygon).
export async function getProductorDetalle(
  productorId: string,
): Promise<ProductorDetalle | null> {
  const supabase = await createClient()

  const { data: productor, error: pErr } = await supabase
    .from('productores')
    .select(
      'id, org_id, codigo, nombre_completo, comunidad, municipio, sexo, anio_ingreso, tipo_productor',
    )
    .eq('id', productorId)
    .maybeSingle()

  if (pErr) throw new Error(`getProductorDetalle (productor): ${pErr.message}`)
  if (!productor) return null

  // Parcelas with embedded café/tropical extensions (PostgREST nested select).
  const { data: parcelas, error: paErr } = await supabase
    .from('parcelas')
    .select(
      `id, codigo_parcela, nombre, comunidad, municipio, tipo_cultivo, superficie_declarada_ha,
       parcela_cafe ( superficie_arabica_ha, superficie_robusta_ha ),
       parcela_tropical ( superficie_2025_ha, cultivos )`,
    )
    .eq('productor_id', productorId)
    .order('codigo_parcela')

  if (paErr) throw new Error(`getProductorDetalle (parcelas): ${paErr.message}`)

  const parcelaIds = (parcelas ?? []).map((p) => p.id)

  // Active polygons for these parcelas (single round-trip, no N+1).
  const polyByParcela = new Map<
    string,
    { estado_validacion: string; area_calc_ha: number | null; diferencia_pct: number | null }
  >()
  if (parcelaIds.length > 0) {
    const { data: polys, error: polyErr } = await supabase
      .from('parcela_poligonos')
      .select('parcela_id, estado_validacion, area_calc_ha, diferencia_pct')
      .eq('activo', true)
      .in('parcela_id', parcelaIds)

    if (polyErr) throw new Error(`getProductorDetalle (poligonos): ${polyErr.message}`)
    for (const row of polys ?? []) {
      polyByParcela.set(row.parcela_id, {
        estado_validacion: row.estado_validacion,
        area_calc_ha: row.area_calc_ha,
        diferencia_pct: row.diferencia_pct,
      })
    }
  }

  const detalleParcelas: ParcelaDetalle[] = (parcelas ?? []).map((p) => {
    // PostgREST returns 1:1 relations as an object or array depending on config.
    const cafe = Array.isArray(p.parcela_cafe) ? p.parcela_cafe[0] : p.parcela_cafe
    const trop = Array.isArray(p.parcela_tropical)
      ? p.parcela_tropical[0]
      : p.parcela_tropical
    const poly = polyByParcela.get(p.id)

    return {
      id: p.id,
      codigo_parcela: p.codigo_parcela,
      nombre: p.nombre,
      comunidad: p.comunidad,
      municipio: p.municipio,
      tipo_cultivo: p.tipo_cultivo,
      superficie_declarada_ha: p.superficie_declarada_ha,
      estado_validacion: (poly?.estado_validacion ?? 'sin_poligono') as ParcelaDetalle['estado_validacion'],
      area_calc_ha: poly?.area_calc_ha ?? null,
      diferencia_pct: poly?.diferencia_pct ?? null,
      superficie_arabica_ha: cafe?.superficie_arabica_ha ?? null,
      superficie_robusta_ha: cafe?.superficie_robusta_ha ?? null,
      superficie_2025_ha: trop?.superficie_2025_ha ?? null,
      cultivos: trop?.cultivos ?? null,
    }
  })

  return {
    productor: productor as Productor,
    parcelas: detalleParcelas,
  }
}
