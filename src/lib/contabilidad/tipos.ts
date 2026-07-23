// Contabilidad — tipos puros (client-safe).

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
  importe_pagado: number
  factura: string | null
}

export const fmtMXN = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const fmtNum = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : Number(n).toLocaleString('es-MX', { maximumFractionDigits: d })
