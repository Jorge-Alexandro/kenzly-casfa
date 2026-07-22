// Módulo 8 — Contratos de fijación: tipos y constantes PURAS (client-safe).
// El acceso a datos vive en lib/data/contratos.ts (server only).

export type ContratoEstado =
  | 'borrador'
  | 'emitido'
  | 'firmado'
  | 'cumplido'
  | 'cancelado'

export type ArbitrajeTipo = 'nacional' | 'internacional'

export const CONTRATO_ESTADO_LABEL: Record<ContratoEstado, string> = {
  borrador: 'Borrador',
  emitido: 'Emitido',
  firmado: 'Firmado',
  cumplido: 'Cumplido',
  cancelado: 'Cancelado',
}

export const CONTRATO_ESTADO_BADGE: Record<ContratoEstado, string> = {
  borrador: 'bg-slate-100 text-slate-600',
  emitido: 'bg-sky-100 text-sky-700',
  firmado: 'bg-emerald-100 text-emerald-700',
  cumplido: 'bg-violet-100 text-violet-700',
  cancelado: 'bg-rose-100 text-rose-700',
}

export const ARBITRAJE_LABEL: Record<ArbitrajeTipo, string> = {
  nacional: 'Nacional — Cámara Nacional de Comercio',
  internacional: 'Internacional — Contrato "C" de Nueva York',
}

/** Datos del comprador (CASFA) — una fila por org. */
export interface ContratoConfig {
  razon_social: string
  rfc: string | null
  domicilio_fiscal: string | null
  representante_nombre: string | null
  representante_cargo: string | null
  firma_representante_url: string | null
  arbitraje_nacional_texto: string
  arbitraje_internacional_texto: string
  lugar_firma: string | null
}

/**
 * Vendedor del contrato = proveedor del padrón de ACOPIO (`acopio_proveedor`),
 * el mismo que se usa al capturar una entrada. Es la lista correcta porque a
 * quien se le compra café es a quien se le hace el contrato; muchos son
 * empresas y no están en el padrón de certificación.
 *
 * Ese padrón sólo guarda nombre/comunidad/municipio: CURP, RFC y teléfono se
 * capturan a mano en el contrato.
 */
export interface VendedorLite {
  id: string
  nombre_completo: string
  comunidad: string | null
  municipio: string | null
}

/** Plantilla por tipo de café: las cláusulas que cambian según el producto. */
export interface ContratoPlantilla {
  especie: string
  tipo: string
  nombre: string
  unidad: string // kg (el precio se pacta por kilo)
  moneda: string // MXN | USD
  /** Kg por quintal del producto: 57.5 pergamino, 45.35 oro, 80 cerezo. */
  factor_quintal: number | null
  calidad_texto: string
  costalera_texto: string
  condiciones_texto: string
}

/** Fila de la lista de contratos. */
export interface ContratoRow {
  id: string
  folio: number
  fecha: string
  vendedor_nombre: string
  comunidad: string | null
  municipio: string | null
  especie: string
  tipo: string
  /** Kilos pactados (la unidad la dice `unidad`). */
  cantidad: number
  unidad: string
  /** Precio por kilo. */
  precio_unitario: number
  moneda: string
  importe: number
  /** El mismo volumen en quintales (sacos). */
  quintales: number | null
  /** Kg por quintal con el que se firmó (snapshot). */
  factor_quintal: number | null
  arbitraje: ArbitrajeTipo
  estado: ContratoEstado
}

/** Contrato completo (detalle + PDF). */
export interface ContratoDetalle extends ContratoRow {
  ciclo: string | null
  productor_id: string | null
  vendedor_domicilio: string | null
  vendedor_curp: string | null
  vendedor_rfc: string | null
  vendedor_telefono: string | null
  anticipo: number
  fecha_entrega: string | null
  // Snapshot de cláusulas al emitir (inmutables).
  calidad_texto: string | null
  costalera_texto: string | null
  condiciones_texto: string | null
  arbitraje_texto: string | null
  lugar_firma: string | null
  // Firma electrónica
  firma_vendedor_url: string | null
  firma_comprador_url: string | null
  firmado_vendedor_at: string | null
  firmado_comprador_at: string | null
  /** Token de la liga de firma remota del vendedor (null = sin liga). */
  firma_token: string | null
  observaciones: string | null
}

/**
 * Folio visible del contrato: "CASFA CF #1" (CF = Contrato de Fijación).
 * En la base sigue siendo un entero consecutivo; esto es sólo su presentación,
 * para que el número no se confunda con el folio de una boleta de acopio.
 */
export const folioContrato = (folio: number) => `CASFA CF #${folio}`

/** Número a moneda: $1,234.56 MXN. */
export function fmtDinero(n: number | null | undefined, moneda = 'MXN'): string {
  if (n == null) return '—'
  return `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`
}

/** Cantidad con su unidad: "125.5 quintales". */
export function fmtCantidad(n: number | null | undefined, unidad = 'quintal'): string {
  if (n == null) return '—'
  const v = Number(n).toLocaleString('es-MX', { maximumFractionDigits: 3 })
  const u = Number(n) === 1 ? unidad : unidad === 'quintal' ? 'quintales' : `${unidad}`
  return `${v} ${u}`
}
