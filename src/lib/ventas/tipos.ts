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

export function formatoMXN(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 })
}

export function formatoNum(n: number, dec = 1): string {
  return n.toLocaleString('es-MX', { maximumFractionDigits: dec })
}
