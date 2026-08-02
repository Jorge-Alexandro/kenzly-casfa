// Módulo Ventas — queries de servidor. RLS acota todo por organización.
// Server-only (jala next/headers vía el cliente Supabase de servidor);
// los tipos client-safe viven en lib/ventas/tipos.ts.
import { createClient } from '@/lib/supabase/server'
import type {
  ClienteVenta,
  EstadoPedido,
  FacturaPedido,
  LineaPedido,
  OrigenVenta,
  PagoPedido,
  PedidoDetalle,
  PedidoRow,
  ProductoVenta,
  StockRow,
  VentasProductoMes,
} from '@/lib/ventas/tipos'

export * from '@/lib/ventas/tipos'

export interface ProductoConKg extends ProductoVenta {
  kg_por_unidad: number
}

export interface FacturaRow {
  id: string
  folio_fiscal: string
  folio_interno: string | null
  fecha: string
  total: number
  estado: string
  xml_url: string | null
  cliente: { rfc: string; nombre: string } | null
}

export interface DetalleRow {
  id: string
  factura_id: string | null
  cantidad: number
  precio_unitario: number
  importe: number
  fecha: string
  alerta_precio: boolean
  // 0019 agregó 'historico' — el tipo debe reflejar los tres orígenes reales
  origen: OrigenVenta
  producto: { id: string; nombre: string; linea: string; unidad: string; kg_por_unidad: number } | null
  cliente: { id: string; rfc: string; nombre: string } | null
}

export async function getClientes(): Promise<ClienteVenta[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_cliente')
    .select('id, rfc, nombre, regimen_fiscal, tipo_cliente, pais')
    .order('nombre')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ClienteVenta[]
}

export async function getProductos(): Promise<ProductoConKg[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_producto')
    .select('id, nombre, linea, unidad, kg_por_unidad, clave_sat')
    .eq('activo', true)
    .order('linea')
    .order('nombre')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ProductoConKg[]
}

export async function getStock(): Promise<(StockRow & { producto: { nombre: string; linea: string } | null })[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_stock')
    .select('producto_id, cantidad_disponible, unidad, producto:ventas_producto(nombre, linea)')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as (StockRow & { producto: { nombre: string; linea: string } | null })[]
}

export async function getFacturas(anio: number): Promise<FacturaRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_factura')
    .select('id, folio_fiscal, folio_interno, fecha, total, estado, xml_url, cliente:ventas_cliente(rfc, nombre)')
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`)
    .order('fecha', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as FacturaRow[]
}

export async function getDetalles(anio: number): Promise<DetalleRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_detalle')
    .select(
      'id, factura_id, cantidad, precio_unitario, importe, fecha, alerta_precio, origen, ' +
        'producto:ventas_producto(id, nombre, linea, unidad, kg_por_unidad), ' +
        'cliente:ventas_cliente(id, rfc, nombre)',
    )
    .gte('fecha', `${anio}-01-01`)
    .lte('fecha', `${anio}-12-31`)
    .order('fecha', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as DetalleRow[]
}

// ----------------------------------------------------------------------------
// Pedidos (la venta capturada desde cero) + su cobranza — espejo de
// getBoletasConCosto en Contabilidad: una fila trae anidados sus pagos y
// facturas en un solo viaje.
// ----------------------------------------------------------------------------
interface PedidoConAnidados {
  id: string
  fecha: string
  estado: EstadoPedido
  notas: string | null
  motivo_cancelacion: string | null
  dias_credito: number
  importe_pagado: number | string
  cliente: { id: string; nombre: string; rfc: string } | { id: string; nombre: string; rfc: string }[] | null
  ventas_detalle: { id: string; importe: number | string; alerta_precio: boolean }[] | null
  ventas_pago: (Omit<PagoPedido, 'monto'> & { monto: number | string })[] | null
  ventas_pedido_factura: (Omit<FacturaPedido, 'monto'> & { monto: number | string | null })[] | null
}

const unoDe = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

export async function getPedidos(): Promise<PedidoRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_pedido')
    .select(
      'id, fecha, estado, notas, motivo_cancelacion, dias_credito, importe_pagado,' +
        ' cliente:ventas_cliente(id, nombre, rfc),' +
        ' ventas_detalle(id, importe, alerta_precio),' +
        ' ventas_pedido_factura(id)',
    )
    .order('fecha', { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)

  return ((data ?? []) as unknown as PedidoConAnidados[]).map((p) => {
    const cliente = unoDe(p.cliente)
    const lineas = p.ventas_detalle ?? []
    return {
      id: p.id,
      cliente_id: cliente?.id ?? '',
      cliente_nombre: cliente?.nombre ?? '—',
      fecha: p.fecha,
      estado: p.estado,
      dias_credito: p.dias_credito,
      total: lineas.reduce((s, l) => s + Number(l.importe), 0),
      importe_pagado: Number(p.importe_pagado),
      n_lineas: lineas.length,
      n_facturas: (p.ventas_pedido_factura ?? []).length,
    }
  })
}

export async function getPedidoDetalle(id: string): Promise<PedidoDetalle | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_pedido')
    .select(
      'id, fecha, estado, notas, motivo_cancelacion, dias_credito, importe_pagado,' +
        ' cliente:ventas_cliente(id, nombre, rfc),' +
        ' ventas_detalle(id, producto_id, cantidad, precio_unitario, importe, alerta_precio,' +
        '   producto:ventas_producto(nombre, unidad)),' +
        ' ventas_pago(id, fecha, monto, metodo, referencia, observaciones),' +
        ' ventas_pedido_factura(id, folio, fecha, monto, uuid_fiscal, observaciones)',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null

  interface DetalleAnidado {
    id: string
    producto_id: string
    cantidad: number | string
    precio_unitario: number | string
    importe: number | string
    alerta_precio: boolean
    producto: { nombre: string; unidad: string } | { nombre: string; unidad: string }[] | null
  }

  interface PedidoDetalleCrudo {
    id: string
    fecha: string
    estado: EstadoPedido
    notas: string | null
    motivo_cancelacion: string | null
    dias_credito: number
    importe_pagado: number | string
    cliente: { id: string; nombre: string; rfc: string } | { id: string; nombre: string; rfc: string }[] | null
    ventas_detalle: DetalleAnidado[] | null
    ventas_pago: (Omit<PagoPedido, 'monto'> & { monto: number | string })[] | null
    ventas_pedido_factura: (Omit<FacturaPedido, 'monto'> & { monto: number | string | null })[] | null
  }

  const p = data as unknown as PedidoDetalleCrudo
  const cliente = unoDe(p.cliente)

  const lineas: LineaPedido[] = (p.ventas_detalle ?? []).map((d) => {
    const prod = unoDe(d.producto)
    return {
      id: d.id,
      producto_id: d.producto_id,
      producto_nombre: prod?.nombre ?? '—',
      producto_unidad: prod?.unidad ?? '',
      cantidad: Number(d.cantidad),
      precio_unitario: Number(d.precio_unitario),
      importe: Number(d.importe),
      alerta_precio: d.alerta_precio,
    }
  })

  const pagos: PagoPedido[] = (p.ventas_pago ?? [])
    .map((x) => ({ ...x, monto: Number(x.monto) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  const facturas: FacturaPedido[] = (p.ventas_pedido_factura ?? []).map((x) => ({
    ...x,
    monto: x.monto == null ? null : Number(x.monto),
  }))

  return {
    id: p.id,
    cliente: cliente ?? { id: '', nombre: '—', rfc: '' },
    fecha: p.fecha,
    estado: p.estado,
    notas: p.notas,
    motivo_cancelacion: p.motivo_cancelacion,
    dias_credito: p.dias_credito,
    importe_pagado: Number(p.importe_pagado),
    lineas,
    pagos,
    facturas,
  }
}

// ----------------------------------------------------------------------------
// Agregado producto × mes: la matriz del reporte (espejo del Excel). La arma
// el servidor a partir del detalle para que gráficas y CSV lean UNA fuente.
// ----------------------------------------------------------------------------
export interface VentasProductoMesExt extends VentasProductoMes {
  kg_por_unidad: number
  unidad: string
}

export function agregarPorProductoMes(detalles: DetalleRow[]): VentasProductoMesExt[] {
  const porProducto = new Map<string, VentasProductoMesExt>()
  for (const d of detalles) {
    if (!d.producto) continue
    const mes = Number(d.fecha.slice(5, 7)) - 1 // 0..11
    if (mes < 0 || mes > 11) continue
    let fila = porProducto.get(d.producto.id)
    if (!fila) {
      fila = {
        producto_id: d.producto.id,
        nombre: d.producto.nombre,
        linea: d.producto.linea,
        cantidad_mes: Array(12).fill(0),
        importe_mes: Array(12).fill(0),
        total_cantidad: 0,
        total_importe: 0,
        kg_por_unidad: Number(d.producto.kg_por_unidad ?? 1),
        unidad: d.producto.unidad,
      }
      porProducto.set(d.producto.id, fila)
    }
    fila.cantidad_mes[mes] += Number(d.cantidad)
    fila.importe_mes[mes] += Number(d.importe)
    fila.total_cantidad += Number(d.cantidad)
    fila.total_importe += Number(d.importe)
  }
  return Array.from(porProducto.values()).sort(
    (a, b) => a.linea.localeCompare(b.linea) || a.nombre.localeCompare(b.nombre),
  )
}

// Importe total por mes (para la curva estacional).
export function totalPorMes(detalles: DetalleRow[]): number[] {
  const meses = Array(12).fill(0)
  for (const d of detalles) {
    const mes = Number(d.fecha.slice(5, 7)) - 1
    if (mes >= 0 && mes <= 11) meses[mes] += Number(d.importe)
  }
  return meses
}

// Importe $ y KG por línea (para valor vs volumen).
export function porLinea(detalles: DetalleRow[]): { linea: string; importe: number; kg: number }[] {
  const map = new Map<string, { linea: string; importe: number; kg: number }>()
  for (const d of detalles) {
    if (!d.producto) continue
    const linea = d.producto.linea
    const fila = map.get(linea) ?? { linea, importe: 0, kg: 0 }
    fila.importe += Number(d.importe)
    fila.kg += Number(d.cantidad) * Number(d.producto.kg_por_unidad ?? 1)
    map.set(linea, fila)
  }
  return Array.from(map.values()).sort((a, b) => b.importe - a.importe)
}
