// Módulo 9 — Salidas: tipos y constantes PURAS (client-safe).

export type EstadoSalida = 'programada' | 'entregada' | 'cancelada'

export const ESTADO_SALIDA_LABEL: Record<EstadoSalida, string> = {
  programada: 'Programada',
  entregada: 'Entregada',
  cancelada: 'Cancelada',
}

export const ESTADO_SALIDA_BADGE: Record<EstadoSalida, string> = {
  programada: 'bg-amber-100 text-amber-700',
  entregada: 'bg-emerald-100 text-emerald-700',
  cancelada: 'bg-rose-100 text-rose-700',
}

/** Salida física. Sin dinero: esto lo ve y captura el operativo. */
export interface SalidaRow {
  id: string
  folio: number
  fecha: string
  guia: string | null
  cliente: string
  destino: string | null
  especie: string | null
  tipo: string | null
  producto_texto: string | null
  sacos: number
  kg: number
  quintales: number | null
  responsable: string | null
  transporte: string | null
  placas: string | null
  observaciones: string | null
  estado: EstadoSalida
}

/** Precio de venta (tabla aparte; sólo Contabilidad). */
export interface SalidaVenta {
  precio_kg: number | null
  importe: number | null
  moneda: string
  importe_cobrado: number
  factura: string | null
}

export interface SalidaConVenta extends SalidaRow {
  venta: SalidaVenta | null
}

export const fmtMXN = (n: number | null | undefined, moneda = 'MXN') =>
  n == null
    ? '—'
    : `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`

export const fmtNum = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : Number(n).toLocaleString('es-MX', { maximumFractionDigits: d })
