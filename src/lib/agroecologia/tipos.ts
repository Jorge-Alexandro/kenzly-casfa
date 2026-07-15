// Agroecología — Estimación de cosecha: tipos y constantes PURAS (client-safe).
// El acceso a datos vive en src/lib/data/estimacion.ts (server only).

export type EstimacionMetodo = 'cafe' | 'cacao'

export const METODO_LABEL: Record<EstimacionMetodo, string> = {
  cafe: 'Café (bandolas)',
  cacao: 'Cacao (mazorcas)',
}

/** Fila de la lista de estimaciones. */
export interface EstimacionRow {
  id: string
  ciclo: string
  cultivo: string
  metodo: EstimacionMetodo
  parcela_nombre: string | null
  parcela_codigo: string | null
  proveedor_nombre: string | null
  kg_estimado: number | null
  valor_final_kg: number | null
  fecha: string
}

/** Config por método (desde estimacion_regla). */
export interface FactorEscalon {
  hasta: number | null
  factor: number
}
export interface ReglaCafe {
  constante: number
  oro_kg: number
  /** kg por quintal según la base del cultivo (cafe_robusta=80, cafe_arabe=57.5, oro=45.35). */
  kg_por_quintal: Record<string, number>
  factores: FactorEscalon[]
}
export interface ReglaCacao {
  im: number
  muestra_arboles: number
}
export interface Reglas {
  cafe: ReglaCafe
  cacao: ReglaCacao
}

export interface ParcelaLite {
  id: string
  codigo_parcela: string
  nombre: string | null
  superficie_ha: number | null
  tipo_cultivo: string
}
