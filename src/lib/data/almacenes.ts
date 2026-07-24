// Reparto cooperativa FLO / CASFASA para las boletas de acopio de Chula Vista.
// Server-only: lee las entradas y la estimación de cosecha (LPA). El resultado
// alimenta la captura de costo (sólo se paga la parte de CASFASA) y el resumen
// de almacenes de Contabilidad.
import type { SupabaseClient } from '@supabase/supabase-js'
import { esCooperativa, repartirProductor, type RepartoBoleta } from '@/lib/contabilidad/almacenes'

/** Ciclo activo de café robusta (el LPA de Chula Vista se cargó con este ciclo). */
export const CICLO_ACTIVO = '2025-2026'

export interface AsignacionBoleta extends RepartoBoleta {
  /** Estimación total del productor en el ciclo (suma del LPA). */
  estimacion_kg: number
  /** Kg entregados por el productor en la cooperativa (todo el ciclo). */
  entregado_total: number
}

interface EntCoop {
  id: string
  productor_id: string | null
  folio: number
  fecha_acopio: string
  comunidad: string | null
  kg_netos: number | string | null
}

/**
 * Reparto de TODAS las boletas de la cooperativa (comunidad = Chula Vista).
 * Devuelve un mapa entrada_id → {kg_coop, kg_casfasa, estimacion_kg, ...}. Las
 * boletas que no son de la cooperativa no aparecen en el mapa.
 */
export async function getAsignacionCoop(
  supabase: SupabaseClient,
): Promise<Map<string, AsignacionBoleta>> {
  const { data: ent, error } = await supabase
    .from('entradas')
    .select('id, productor_id, folio, fecha_acopio, comunidad, kg_netos')
    .limit(5000)
  if (error) throw new Error(error.message)

  const coop = ((ent ?? []) as EntCoop[]).filter((e) => esCooperativa(e.comunidad))
  const out = new Map<string, AsignacionBoleta>()
  if (coop.length === 0) return out

  // Estimación por productor (suma de sus parcelas en el ciclo).
  const idsUnicos = new Set<string>()
  for (const e of coop) if (e.productor_id) idsUnicos.add(e.productor_id)
  const productorIds = Array.from(idsUnicos)
  const estimPorProductor = new Map<string, number>()
  if (productorIds.length) {
    const { data: est, error: eErr } = await supabase
      .from('estimacion_cosecha')
      .select('productor_id, valor_final_kg, kg_estimado')
      .eq('ciclo', CICLO_ACTIVO)
      .in('productor_id', productorIds)
      .limit(5000)
    if (eErr) throw new Error(eErr.message)
    for (const r of est ?? []) {
      const pid = r.productor_id as string | null
      if (!pid) continue
      const kg = Number(r.valor_final_kg ?? r.kg_estimado ?? 0)
      estimPorProductor.set(pid, (estimPorProductor.get(pid) ?? 0) + kg)
    }
  }

  // Agrupar por productor, ordenar cronológicamente y repartir.
  const porProductor = new Map<string, EntCoop[]>()
  for (const e of coop) {
    const pid = e.productor_id ?? `sin-productor:${e.id}`
    const arr = porProductor.get(pid) ?? []
    arr.push(e)
    porProductor.set(pid, arr)
  }

  for (const [pid, arr] of Array.from(porProductor.entries())) {
    arr.sort(
      (a: EntCoop, b: EntCoop) =>
        String(a.fecha_acopio).localeCompare(String(b.fecha_acopio)) ||
        Number(a.folio) - Number(b.folio),
    )
    const estim = estimPorProductor.get(pid) ?? 0
    const conKg = arr.map((e: EntCoop) => ({ e, kg: Number(e.kg_netos) || 0 }))
    const entregado =
      Math.round(conKg.reduce((s: number, x: { kg: number }) => s + x.kg, 0) * 1000) / 1000
    const reparto = repartirProductor(conKg, estim)
    for (const item of conKg) {
      const r = reparto.get(item)!
      out.set(item.e.id, {
        kg_coop: r.kg_coop,
        kg_casfasa: r.kg_casfasa,
        estimacion_kg: Math.round(estim * 1000) / 1000,
        entregado_total: entregado,
      })
    }
  }
  return out
}
