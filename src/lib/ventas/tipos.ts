// Tipos y constantes CLIENT-SAFE del módulo Ventas.
// (Regla del repo: nada de imports de servidor aquí — un Client Component que
// importe de data/ventas.ts jala next/headers y rompe el build.)

export type OrigenVenta = 'cfdi' | 'manual' | 'historico'

export const ORIGEN_LABEL: Record<OrigenVenta, string> = {
  cfdi: 'CFDI',
  manual: 'Manual',
  historico: 'Histórico',
}

export const ORIGEN_BADGE: Record<OrigenVenta, string> = {
  cfdi: 'bg-sky-50 text-sky-700',
  manual: 'bg-amber-50 text-amber-700',
  historico: 'bg-slate-100 text-slate-600',
}

export const MESES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
] as const

export const MESES_LARGO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const

export type TipoCliente = 'nacional' | 'exportacion' | 'publico'

export const TIPO_CLIENTE_LABEL: Record<TipoCliente, string> = {
  nacional: 'Nacional',
  exportacion: 'Comercio exterior',
  publico: 'Público en general',
}

export const TIPO_CLIENTE_BADGE: Record<TipoCliente, string> = {
  nacional: 'bg-emerald-50 text-emerald-700',
  exportacion: 'bg-indigo-50 text-indigo-700',
  publico: 'bg-slate-100 text-slate-600',
}

export interface ClienteVenta {
  id: string
  rfc: string
  nombre: string
  regimen_fiscal: string | null
  tipo_cliente: TipoCliente
  pais: string | null
}

export interface ProductoVenta {
  id: string
  nombre: string
  linea: string
  unidad: string
  clave_sat: string | null
}

export interface StockRow {
  producto_id: string
  cantidad_disponible: number
  unidad: string
}

export interface PrecioCliente {
  producto_id: string
  precio_acordado: number
  tolerancia_pct: number
}

export interface DetalleVenta {
  id: string
  factura_id: string | null
  producto_id: string
  cliente_id: string
  cantidad: number
  precio_unitario: number
  importe: number
  fecha: string
  alerta_precio: boolean
  origen: OrigenVenta
}

// Agregado mensual por producto — la forma que consumen las gráficas y el CSV
// (espejo de la matriz del Excel "Reporte de Ventas Producto Terminado").
export interface VentasProductoMes {
  producto_id: string
  nombre: string
  linea: string
  // index 0..11 = Ene..Dic
  cantidad_mes: number[]
  importe_mes: number[]
  total_cantidad: number
  total_importe: number
}

// El reporte viejo de Excel calculaba "Kilogramos Procesados" con =Cantidad/2
// en TODAS las filas — sólo por coincidencia acertaba en la presentación de
// 500 g; en la de 908 g subestimaba el kilaje real ~45%. kg_por_unidad ya se
// deriva bien por producto, pero esta función AUDITA que siga siendo así:
// lee el gramaje que trae el propio nombre del producto (el que factura el
// SAT) y lo compara. Sólo advierte — nunca decide sola, un producto sin
// gramaje en el nombre (a granel, "CUBETA/5KG") no se puede verificar así.
export function gramajeDelNombre(nombre: string): number | null {
  const coincidencias = Array.from(nombre.matchAll(/(\d+(?:[.,]\d+)?)\s*(kgs?|grs?|g)\b/gi))
  if (coincidencias.length === 0) return null
  const [, valorTxt, unidad] = coincidencias[coincidencias.length - 1]
  const valor = Number(valorTxt.replace(',', '.'))
  if (!Number.isFinite(valor) || valor <= 0) return null
  return /^k/i.test(unidad) ? valor : valor / 1000
}

// ----------------------------------------------------------------------------
// Pedido/venta capturado desde cero (Diego/Liz) — espejo de Contabilidad
// (entrada_pago/entrada_factura). El pedido + sus líneas son el evento real
// que descuenta inventario; pagos y facturas son evidencia aparte que nunca
// vuelve a tocar el stock (ver migración 0053_ventas_pedidos.sql).
// ----------------------------------------------------------------------------
export type EstadoPedido = 'abierta' | 'cancelada'

export const METODOS_PAGO_VENTA = ['Efectivo', 'Transferencia', 'Cheque', 'Depósito'] as const

export interface PedidoRow {
  id: string
  cliente_id: string
  cliente_nombre: string
  fecha: string
  estado: EstadoPedido
  dias_credito: number
  total: number
  importe_pagado: number
  n_lineas: number
  n_facturas: number
}

export interface LineaPedido {
  id: string
  producto_id: string
  producto_nombre: string
  producto_unidad: string
  cantidad: number
  precio_unitario: number
  importe: number
  alerta_precio: boolean
}

export interface PagoPedido {
  id: string
  fecha: string
  monto: number
  metodo: string | null
  referencia: string | null
  observaciones: string | null
}

export interface FacturaPedido {
  id: string
  folio: string
  fecha: string | null
  monto: number | null
  uuid_fiscal: string | null
  observaciones: string | null
}

export interface PedidoDetalle {
  id: string
  cliente: { id: string; nombre: string; rfc: string }
  fecha: string
  estado: EstadoPedido
  notas: string | null
  motivo_cancelacion: string | null
  dias_credito: number
  importe_pagado: number
  lineas: LineaPedido[]
  pagos: PagoPedido[]
  facturas: FacturaPedido[]
}

// Semáforo de cobranza: "amarillo" 10 días antes del límite de crédito
// (día 20 con el default de 30), "rojo/moroso" al cumplirse. Pura función de
// fecha+saldo — nada que sincronizar, se recalcula sola en cada vista.
export type EstadoCobranza = 'pagado' | 'al_corriente' | 'por_vencer' | 'moroso'

export const COBRANZA_LABEL: Record<EstadoCobranza, string> = {
  pagado: 'Pagado',
  al_corriente: 'Al corriente',
  por_vencer: 'Por vencer',
  moroso: 'Moroso',
}

export const COBRANZA_BADGE: Record<EstadoCobranza, string> = {
  pagado: 'bg-emerald-50 text-emerald-700',
  al_corriente: 'bg-slate-100 text-slate-600',
  por_vencer: 'bg-amber-50 text-amber-700',
  moroso: 'bg-rose-50 text-rose-700',
}

export function diasTranscurridos(fechaISO: string): number {
  const inicio = new Date(`${fechaISO}T00:00:00`).getTime()
  return Math.floor((Date.now() - inicio) / 86_400_000)
}

export function estadoCobranza(p: { fecha: string; dias_credito: number; total: number; importe_pagado: number }): EstadoCobranza {
  if (p.total - p.importe_pagado <= 0.005) return 'pagado'
  const dias = diasTranscurridos(p.fecha)
  if (dias >= p.dias_credito) return 'moroso'
  if (dias >= p.dias_credito - 10) return 'por_vencer'
  return 'al_corriente'
}

// ----------------------------------------------------------------------------
// Inventario — movimientos que NO son venta (la venta ya descuenta stock sola
// vía el pedido, Fase 4). Esto es "pestaña aparte" a propósito: regalía y
// cortesía SALEN sin cobro, merma es pérdida, los ajustes corrigen el conteo.
// ----------------------------------------------------------------------------
export type TipoMovimiento = 'regalia' | 'cortesia' | 'merma' | 'ajuste_mas' | 'ajuste_menos' | 'entrada'

export const TIPO_MOVIMIENTO_LABEL: Record<TipoMovimiento, string> = {
  regalia: 'Regalía',
  cortesia: 'Cortesía',
  merma: 'Merma',
  ajuste_mas: 'Ajuste (+)',
  ajuste_menos: 'Ajuste (−)',
  entrada: 'Entrada',
}

export const TIPO_MOVIMIENTO_BADGE: Record<TipoMovimiento, string> = {
  regalia: 'bg-indigo-50 text-indigo-700',
  cortesia: 'bg-sky-50 text-sky-700',
  merma: 'bg-rose-50 text-rose-700',
  ajuste_mas: 'bg-emerald-50 text-emerald-700',
  ajuste_menos: 'bg-amber-50 text-amber-700',
  entrada: 'bg-emerald-50 text-emerald-700',
}

/** true = suma al inventario; false = resta. */
export const MOVIMIENTO_SUMA: Record<TipoMovimiento, boolean> = {
  regalia: false,
  cortesia: false,
  merma: false,
  ajuste_menos: false,
  ajuste_mas: true,
  entrada: true,
}

export interface MovimientoRow {
  id: string
  producto_id: string
  producto_nombre: string
  producto_unidad: string
  tipo: TipoMovimiento
  cantidad: number
  cliente_nombre: string | null
  fecha: string
  motivo: string | null
}

// ----------------------------------------------------------------------------
// Requisiciones — la orden interna de producción para torrefacción: qué y
// cuánto hay que preparar. No descuenta inventario (es papeleo); el stock ya
// lo gobiernan la venta capturada y los movimientos.
// ----------------------------------------------------------------------------
export interface RequisicionItem {
  id: string
  producto_id: string
  producto_nombre: string
  producto_unidad: string
  cantidad: number
  kg_equivalente: number
}

export interface RequisicionRow {
  id: string
  folio: number
  fecha: string
  cliente_nombre: string | null
  cliente_texto: string | null
  n_items: number
  total_kg: number
}

export interface RequisicionDetalle {
  id: string
  folio: number
  fecha: string
  cliente_nombre: string | null
  cliente_texto: string | null
  solicito: string | null
  autorizo: string | null
  entrego: string | null
  notas: string | null
  items: RequisicionItem[]
}

export function formatoMXN(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })
}

export function formatoNum(n: number, dec = 1): string {
  return n.toLocaleString('es-MX', { maximumFractionDigits: dec })
}
