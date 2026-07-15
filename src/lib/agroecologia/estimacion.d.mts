// Tipos del motor de estimación de cosecha (implementación en estimacion.mjs).

export const CACAO_IM_DEFAULT: number
export const CACAO_MUESTRA_ARBOLES: number
export const CAFE_CONSTANTE: number
export const OQ_ORO_KG: number

export interface FactorEscalon {
  hasta: number
  factor: number
}
export const CAFE_FACTORES_DEFAULT: FactorEscalon[]

export function redondear(n: number, d?: number): number

export interface CacaoInput {
  /** Muestra: mazorcas por árbol × cuántos árboles cayeron en ese grupo. */
  muestras?: Array<{ mazorcas: number | string; arboles: number | string }>
  /** Alternativa: promedio de mazorcas/árbol ya calculado. */
  promedio_mazorcas?: number | string
  /** Nº total de árboles productivos de la parcela. */
  n_arboles: number | string
}
export interface CacaoResultado {
  promedio_mazorcas: number
  total_mazorcas: number
  kg_seco: number
  tm: number
}
export function estimarCacao(
  p: CacaoInput,
  cfg?: { im?: number },
): CacaoResultado

export function factorCafe(promedio: number | string, tabla?: FactorEscalon[]): number

export interface CafeInput {
  promedio_cerezo_bandola: number | string
  plantas_ha: number | string
  superficie_ha?: number | string
}
export interface CafeResultado {
  factor: number
  /** Quintales por hectárea (invariante de base). */
  qq_ha: number
  superficie_ha?: number
  /** Quintales totales de la parcela. */
  qq?: number
  /** Kg en la base del cultivo (cereza robusta / pergamino árabe / oro). */
  kg?: number
  tm?: number
}
export function estimarCafe(
  p: CafeInput,
  cfg?: { factores?: FactorEscalon[]; constante?: number; kgPorQuintal?: number },
): CafeResultado
