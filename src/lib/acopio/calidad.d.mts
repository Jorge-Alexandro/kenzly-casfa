// Tipos del motor de calidad (implementación en calidad.mjs).

export const MUESTRA_G_DEFAULT: number
export const ANALISIS_G_DEFAULT: number

export interface CapturaCalidad {
  oro_g?: number | string | null
  cerezo_g?: number | string | null
  zaranda_16_g?: number | string | null
  zaranda_15_g?: number | string | null
  caracol_g?: number | string | null
  mancha_g?: number | string | null
  /** Humedad del hidrómetro, en PUNTOS (12.5 = 12.5 %). */
  humedad?: number | string | null
}

/** Normas y bases del producto (tabla acopio_producto). */
export interface ConfigCalidad {
  muestra_g?: number | null
  analisis_g?: number | null
  /**
   * ¿Aplica el rendimiento? false cuando el café entró ya en oro (no se acopió
   * en pergamino/cereza) o es cacao → rendimiento null, no 100 %.
   */
  rendimiento_aplica?: boolean
  rend_min?: number | null
  mancha_max?: number | null
  cerezo_max?: number | null
  humedad_min?: number | null
  humedad_max?: number | null
  zaranda16_min?: number | null
}

/** Resultado en FRACCIÓN (0.8013), como lo guarda la base. */
export interface ResultadoCalidad {
  /** null = no aplica (café que entró ya en oro, o cacao). Nunca 1 de relleno. */
  rendimiento: number | null
  cerezo: number | null
  zaranda_16: number | null
  zaranda_15: number | null
  caracol: number | null
  mancha: number | null
  humedad: number | null
  /** Suma de los 4 montones, para ver si el pesado cuadra con la base. */
  suma_analisis_g: number | null
  analisis_g: number | null
  muestra_g: number | null
  avisos: string[]
}

/** Las fracciones guardadas en la entrada (lo que devuelve la base). */
export interface FraccionesCalidad {
  rendimiento?: number | null
  cerezo?: number | null
  zaranda_16?: number | null
  zaranda_15?: number | null
  caracol?: number | null
  mancha?: number | null
  humedad?: number | null
  muestra_g?: number | null
  analisis_g?: number | null
}

export function aplicaRendimiento(especie: string, tipo: string): boolean
export function soloHumedad(especie: string): boolean
export function calcularCalidad(captura?: CapturaCalidad, cfg?: ConfigCalidad): ResultadoCalidad
export function gramosDesdeFracciones(
  e?: FraccionesCalidad,
  cfg?: ConfigCalidad,
): CapturaCalidad
