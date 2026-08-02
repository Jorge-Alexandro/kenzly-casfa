// POST /api/ventas/pedidos — captura una venta desde cero: cliente + una o
// varias líneas de producto. Cada línea nace origen='manual', así que el
// trigger que YA existe (trg_ventas_stock, desde 0018) descuenta inventario
// solo — no hay lógica de stock nueva aquí. El precio se revisa contra el
// acuerdo vigente por línea igual que /api/ventas/ventas (alerta, no bloquea).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

interface LineaBody {
  producto_id: string
  cantidad: number
  precio_unitario: number
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const cliente_id = String(body.cliente_id ?? '')
  const fecha = String(body.fecha ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10)
  const notas = typeof body.notas === 'string' && body.notas.trim() ? body.notas.trim() : null
  const lineasBody: LineaBody[] = Array.isArray(body.lineas) ? body.lineas : []

  if (!cliente_id) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  if (lineasBody.length === 0) return NextResponse.json({ error: 'Agrega al menos un producto' }, { status: 400 })
  for (const l of lineasBody) {
    if (!l.producto_id) return NextResponse.json({ error: 'Falta el producto en una línea' }, { status: 400 })
    if (!Number.isFinite(l.cantidad) || l.cantidad <= 0) {
      return NextResponse.json({ error: 'Cantidad inválida en una línea' }, { status: 400 })
    }
    if (!Number.isFinite(l.precio_unitario) || l.precio_unitario < 0) {
      return NextResponse.json({ error: 'Precio inválido en una línea' }, { status: 400 })
    }
  }

  const supabase = await createClient()

  const { data: cli } = await supabase.from('ventas_cliente').select('id').eq('id', cliente_id).maybeSingle()
  if (!cli) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 400 })

  // Precios acordados vigentes de todos los productos de la venta, en un viaje.
  const productoIds = Array.from(new Set(lineasBody.map((l) => l.producto_id)))
  const { data: acuerdos } = await supabase
    .from('ventas_precio_cliente')
    .select('producto_id, precio_acordado, tolerancia_pct, vigente_desde')
    .eq('cliente_id', cliente_id)
    .in('producto_id', productoIds)
    .lte('vigente_desde', fecha)
    .order('vigente_desde', { ascending: false })
  const acuerdoPorProducto = new Map<string, { precio_acordado: number; tolerancia_pct: number }>()
  for (const a of acuerdos ?? []) {
    if (!acuerdoPorProducto.has(a.producto_id)) {
      acuerdoPorProducto.set(a.producto_id, { precio_acordado: Number(a.precio_acordado), tolerancia_pct: Number(a.tolerancia_pct) })
    }
  }

  const { data: pedido, error: pErr } = await supabase
    .from('ventas_pedido')
    .insert({ org_id: session.orgId, cliente_id, fecha, notas, created_by: session.userId })
    .select('id')
    .single()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 })

  const detalles = lineasBody.map((l) => {
    const acuerdo = acuerdoPorProducto.get(l.producto_id)
    const alerta_precio = !!acuerdo && acuerdo.precio_acordado > 0
      && Math.abs(l.precio_unitario - acuerdo.precio_acordado) / acuerdo.precio_acordado > acuerdo.tolerancia_pct
    return {
      org_id: session.orgId,
      pedido_id: pedido.id,
      factura_id: null,
      producto_id: l.producto_id,
      cliente_id,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
      importe: Math.round(l.cantidad * l.precio_unitario * 100) / 100,
      fecha,
      alerta_precio,
      origen: 'manual' as const,
    }
  })

  const { error: dErr } = await supabase.from('ventas_detalle').insert(detalles)
  if (dErr) {
    // No dejar un pedido sin líneas: se revierte la cabecera.
    await supabase.from('ventas_pedido').delete().eq('id', pedido.id)
    return NextResponse.json({ error: dErr.message }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    id: pedido.id,
    total: detalles.reduce((s, d) => s + d.importe, 0),
    alertas: detalles.filter((d) => d.alerta_precio).length,
  })
}
