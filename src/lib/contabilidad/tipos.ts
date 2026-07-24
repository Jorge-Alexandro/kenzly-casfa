// Contabilidad — tipos puros (client-safe).

/** Un abono de la boleta (se puede pagar en varias exhibiciones). */
export interface Pago {
  id: string
  fecha: string
  monto: number
  metodo: string | null
  referencia: string | null
  observaciones: string | null
}

/** Una factura de la boleta (puede facturarse en partes). */
export interface Factura {
  id: string
  folio: string
  fecha: string | null
  monto: number | null
  uuid_fiscal: string | null
}

export const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Cheque', 'Depósito'] as const

export interface BoletaCosto {
  id: string
  folio: number
  fecha_acopio: string
  proveedor_nombre: string
  comunidad: string | null
  municipio: string | null
  especie: string
  tipo: string
  total_sacos: number
  kg_netos: number
  quintales: number | null
  // Costo (tabla entrada_costo; sólo Contabilidad).
  precio_kg: number | null
  importe: number | null
  /** Total abonado = suma de `pagos` (lo mantiene un trigger). */
  importe_pagado: number
  factura: string | null
  pagos: Pago[]
  facturas: Factura[]
  // Almacén (cooperativa FLO / CASFASA). Sólo relevante si es_cooperativa.
  /** La boleta es de la cooperativa FLO (comunidad Chula Vista). */
  es_cooperativa: boolean
  /** Estimación de cosecha del productor (LPA), suma del ciclo. */
  estimacion_kg: number | null
  /** Kg que el productor lleva entregados en la cooperativa (todo el ciclo). */
  entregado_total: number | null
  /** Kg de la cooperativa por el reparto automático (no se pagan). */
  kg_coop: number
  /** Kg de CASFASA por el reparto automático (excedente; pagable por defecto). */
  kg_casfasa: number
  /** Ajuste manual de kg a pagar; null = usar el reparto automático (kg_casfasa). */
  kg_pagable: number | null
  /** Kilos sobre los que se calcula el importe (base efectiva). */
  base_kg: number
}

/** Kilos sobre los que se paga una boleta: kg_netos, o sólo el excedente si es cooperativa. */
export function baseKg(b: {
  es_cooperativa: boolean
  kg_netos: number
  kg_casfasa: number
  kg_pagable: number | null
}): number {
  if (!b.es_cooperativa) return b.kg_netos
  return b.kg_pagable ?? b.kg_casfasa
}

export const fmtMXN = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const fmtNum = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : Number(n).toLocaleString('es-MX', { maximumFractionDigits: d })

/** Costo de un corte de maquila: lo pagado por las boletas ÷ el oro obtenido. */
export interface MaquilaCosto {
  id: string
  numero: number | null
  especie: string | null
  fecha_corte: string | null
  boletas: number
  boletas_con_precio: number
  importe_total: number // suma del importe de sus boletas (materia prima)
  oro_kg: number // kg de oro exportación obtenidos
  costo_kg_oro: number | null // importe_total ÷ oro_kg
}
