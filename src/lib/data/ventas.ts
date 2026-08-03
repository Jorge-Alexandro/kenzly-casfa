// Módulo Ventas — queries de servidor. RLS acota todo por organización.
// Server-only (jala next/headers vía el cliente Supabase de servidor);
// los tipos client-safe viven en lib/ventas/tipos.ts.
import { createClient } from '@/lib/supabase/server'
import type {
  ClienteVenta,
  EstadoPedido,
  FacturaPedido,
  LineaPedido,
  MovimientoRow,
  OrigenVenta,
  PagoPedido,
  PedidoDetalle,
  PedidoRow,
  ProductoVenta,
  RequisicionDetalle,
  RequisicionItem,
  RequisicionRow,
  StockRow,
  TipoCliente,
  TipoMovimiento,
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
  cliente: { id: string; rfc: string; nombre: string; tipo_cliente: TipoCliente } | null
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
        'cliente:ventas_cliente(id, rfc, nombre, tipo_cliente)',
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

// Top clientes por importe — el KPI que se pidió desde el principio. Sólo
// tiene sentido real desde la Fase 1 (antes, exportación/público colapsaban
// en un cliente genérico y este ranking hubiera salido inútil).
export interface ClienteRanking {
  cliente_id: string
  nombre: string
  tipo_cliente: TipoCliente
  importe: number
  num_ventas: number
  ultima_compra: string
}

export function porCliente(detalles: DetalleRow[]): ClienteRanking[] {
  const map = new Map<string, ClienteRanking>()
  for (const d of detalles) {
    if (!d.cliente) continue
    const fila = map.get(d.cliente.id) ?? {
      cliente_id: d.cliente.id,
      nombre: d.cliente.nombre,
      tipo_cliente: d.cliente.tipo_cliente,
      importe: 0,
      num_ventas: 0,
      ultima_compra: d.fecha,
    }
    fila.importe += Number(d.importe)
    fila.num_ventas += 1
    if (d.fecha > fila.ultima_compra) fila.ultima_compra = d.fecha
    map.set(d.cliente.id, fila)
  }
  return Array.from(map.values()).sort((a, b) => b.importe - a.importe)
}

// Importe y % por tipo de cliente (nacional / comercio exterior / público).
export function porTipoCliente(detalles: DetalleRow[]): { tipo_cliente: TipoCliente; importe: number; pct: number }[] {
  const map = new Map<TipoCliente, number>()
  let total = 0
  for (const d of detalles) {
    if (!d.cliente) continue
    map.set(d.cliente.tipo_cliente, (map.get(d.cliente.tipo_cliente) ?? 0) + Number(d.importe))
    total += Number(d.importe)
  }
  return Array.from(map.entries())
    .map(([tipo_cliente, importe]) => ({ tipo_cliente, importe, pct: total > 0 ? importe / total : 0 }))
    .sort((a, b) => b.importe - a.importe)
}

// ----------------------------------------------------------------------------
// Inventario — movimientos que no son venta (regalía/cortesía/merma/ajuste).
// La venta ya descuenta stock sola desde la Fase 4; esto es la pestaña aparte.
// ----------------------------------------------------------------------------
interface MovimientoCrudo {
  id: string
  producto_id: string
  tipo: TipoMovimiento
  cantidad: number | string
  fecha: string
  motivo: string | null
  producto: { nombre: string; unidad: string } | { nombre: string; unidad: string }[] | null
  cliente: { nombre: string } | { nombre: string }[] | null
}

export async function getMovimientos(): Promise<MovimientoRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_movimiento')
    .select(
      'id, producto_id, tipo, cantidad, fecha, motivo,' +
        ' producto:ventas_producto(nombre, unidad),' +
        ' cliente:ventas_cliente(nombre)',
    )
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw new Error(error.message)

  return ((data ?? []) as unknown as MovimientoCrudo[]).map((m) => {
    const producto = unoDe(m.producto)
    const cliente = unoDe(m.cliente)
    return {
      id: m.id,
      producto_id: m.producto_id,
      producto_nombre: producto?.nombre ?? '—',
      producto_unidad: producto?.unidad ?? '',
      tipo: m.tipo,
      cantidad: Number(m.cantidad),
      cliente_nombre: cliente?.nombre ?? null,
      fecha: m.fecha,
      motivo: m.motivo,
    }
  })
}

// ----------------------------------------------------------------------------
// Requisiciones — orden interna de producción para torrefacción. No toca
// inventario; kg_equivalente sale de ventas_producto.kg_por_unidad (Fase 3,
// ya validado contra la Tabla de Equivalencias real).
// ----------------------------------------------------------------------------
interface RequisicionItemCrudo {
  id: string
  producto_id: string
  cantidad: number | string
  producto: { nombre: string; unidad: string; kg_por_unidad: number | string } | { nombre: string; unidad: string; kg_por_unidad: number | string }[] | null
}

function mapItems(raw: RequisicionItemCrudo[]): RequisicionItem[] {
  return raw.map((it) => {
    const producto = unoDe(it.producto)
    const kgPorUnidad = Number(producto?.kg_por_unidad ?? 1)
    const cantidad = Number(it.cantidad)
    return {
      id: it.id,
      producto_id: it.producto_id,
      producto_nombre: producto?.nombre ?? '—',
      producto_unidad: producto?.unidad ?? '',
      cantidad,
      kg_equivalente: Math.round(cantidad * kgPorUnidad * 1000) / 1000,
    }
  })
}

export async function getRequisiciones(): Promise<RequisicionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_requisicion')
    .select(
      'id, folio, fecha, cliente_texto,' +
        ' cliente:ventas_cliente(nombre),' +
        ' ventas_requisicion_item(id, cantidad, producto:ventas_producto(kg_por_unidad))',
    )
    .order('folio', { ascending: false })
    .limit(1000)
  if (error) throw new Error(error.message)

  interface Raw {
    id: string
    folio: number
    fecha: string
    cliente_texto: string | null
    cliente: { nombre: string } | { nombre: string }[] | null
    ventas_requisicion_item: { id: string; cantidad: number | string; producto: { kg_por_unidad: number | string } | { kg_por_unidad: number | string }[] | null }[] | null
  }

  return ((data ?? []) as unknown as Raw[]).map((r) => {
    const cliente = unoDe(r.cliente)
    const items = r.ventas_requisicion_item ?? []
    const totalKg = items.reduce((s, it) => {
      const prod = unoDe(it.producto)
      return s + Number(it.cantidad) * Number(prod?.kg_por_unidad ?? 1)
    }, 0)
    return {
      id: r.id,
      folio: r.folio,
      fecha: r.fecha,
      cliente_nombre: cliente?.nombre ?? null,
      cliente_texto: r.cliente_texto,
      n_items: items.length,
      total_kg: Math.round(totalKg * 1000) / 1000,
    }
  })
}

export async function getRequisicionDetalle(id: string): Promise<RequisicionDetalle | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_requisicion')
    .select(
      'id, folio, fecha, cliente_texto, solicito, autorizo, entrego, notas,' +
        ' cliente:ventas_cliente(nombre),' +
        ' ventas_requisicion_item(id, producto_id, cantidad, producto:ventas_producto(nombre, unidad, kg_por_unidad))',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null

  interface Raw {
    id: string
    folio: number
    fecha: string
    cliente_texto: string | null
    solicito: string | null
    autorizo: string | null
    entrego: string | null
    notas: string | null
    cliente: { nombre: string } | { nombre: string }[] | null
    ventas_requisicion_item: RequisicionItemCrudo[] | null
  }
  const r = data as unknown as Raw
  const cliente = unoDe(r.cliente)

  return {
    id: r.id,
    folio: r.folio,
    fecha: r.fecha,
    cliente_nombre: cliente?.nombre ?? null,
    cliente_texto: r.cliente_texto,
    solicito: r.solicito,
    autorizo: r.autorizo,
    entrego: r.entrego,
    notas: r.notas,
    items: mapItems(r.ventas_requisicion_item ?? []),
  }
}
