// Dos almacenes en el acopio de CASFA:
//   • CASFASA (principal): compra y PAGA al productor.
//   • Cooperativa FLO (Finca Chula Vista): CASFA acopia pero NO paga; es café
//     de la cooperativa.
//
// Regla: de lo que entrega un productor de la cooperativa, lo que cabe dentro de
// su ESTIMACIÓN de cosecha (LPA) es de la cooperativa (no se paga); el EXCEDENTE
// sobre la estimación lo compra CASFASA (sí se paga). Una sola boleta puede caer
// a caballo del umbral.
//
// Funciones puras (client-safe): normalización, detección y reparto. Sin I/O.

export const ALMACEN_COOP = 'Cooperativa FLO'
export const ALMACEN_PRINCIPAL = 'CASFASA'

/** Valor de `comunidad` (normalizado) que marca la cooperativa FLO en el acopio. */
const COMUNIDAD_COOP = 'chula vista'

export const normComunidad = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** ¿La boleta es de la cooperativa FLO (Chula Vista)? */
export const esCooperativa = (comunidad: string | null | undefined) =>
  normComunidad(comunidad) === COMUNIDAD_COOP

export interface RepartoBoleta {
  /** Kg que corresponden a la cooperativa FLO (no se pagan). */
  kg_coop: number
  /** Kg que corresponden a CASFASA (excedente sobre la estimación; se pagan). */
  kg_casfasa: number
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

/**
 * Reparte las entregas de UN productor entre la cooperativa y CASFASA. Las
 * entregas se recorren EN EL ORDEN DADO (cronológico): se llena la cubeta de la
 * cooperativa hasta la estimación y lo que sobra es de CASFASA. La boleta donde
 * se cruza el umbral queda partida entre los dos almacenes.
 */
export function repartirProductor<T extends { kg: number }>(
  entregas: T[],
  estimacionKg: number,
): Map<T, RepartoBoleta> {
  const out = new Map<T, RepartoBoleta>()
  let restanteCoop = Math.max(0, estimacionKg || 0)
  for (const e of entregas) {
    const kg = Math.max(0, e.kg || 0)
    const coop = Math.min(kg, restanteCoop)
    restanteCoop -= coop
    out.set(e, { kg_coop: round3(coop), kg_casfasa: round3(kg - coop) })
  }
  return out
}
