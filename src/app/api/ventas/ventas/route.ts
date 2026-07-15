// POST /api/ventas/ventas — captura manual de una venta.
// El servidor recalcula importe y decide alerta_precio contra el precio
// acordado vigente (ventas_precio_cliente): si se desvía más de tolerancia_pct
// se MARCA, no se bloquea (política del reporte de ventas). El descuento de
// inventario lo hace el trigger trg_ventas_stock en la BD.
// Body: { cliente_id, producto_id, cantidad, precio_unitario, fecha? }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const cliente_id = String(body.cliente_id ?? '')
  const producto_id = String(body.producto_id ?? '')
  const cantidad = Number(body.cantidad)
  const precio_unitario = Number(body.precio_unitario)
  const fecha = String(body.fecha ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10)

  if (!cliente_id || !producto_id) {
    return NextResponse.json({ error: 'Falta cliente o producto' }, { status: 400 })
  }
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 })
  }
  if (!Number.isFinite(precio_unitario) || precio_unitario < 0) {
    return NextResponse.json({ error: 'Precio inválido' }, { status: 400 })
  }

  const supabase = await createClient()

  // Existencia (RLS ya acota a la org; esto convierte un id ajeno en 400 claro).
  const [{ data: cli }, { data: prod }] = await Promise.all([
    supabase.from('ventas_cliente').select('id').eq('id', cliente_id).maybeSingle(),
    supabase.from('ventas_producto').select('id').eq('id', producto_id).maybeSingle(),
  ])
  if (!cli) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 400 })
  if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 400 })

  // Precio acordado vigente más reciente para este cliente+producto.
  const { data: precio } = await supabase
    .from('ventas_precio_cliente')
    .select('precio_acordado, tolerancia_pct')
    .eq('cliente_id', cliente_id)
    .eq('producto_id', producto_id)
    .lte('vigente_desde', fecha)
    .order('vigente_desde', { ascending: false })
    .limit(1)
    .maybeSingle()

  let alerta_precio = false
  if (precio && Number(precio.precio_acordado) > 0) {
    const desvio = Math.abs(precio_unitario - Number(precio.precio_acordado)) / Number(precio.precio_acordado)
    alerta_precio = desvio > Number(precio.tolerancia_pct)
  }

  const { data: detalle, error } = await supabase
    .from('ventas_detalle')
    .insert({
      org_id: session.orgId,
      factura_id: null,
      producto_id,
      cliente_id,
      cantidad,
      precio_unitario,
      importe: Math.round(cantidad * precio_unitario * 100) / 100,
      fecha,
      alerta_precio,
      origen: 'manual',
    })
    .select('id, importe')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    ok: true,
    id: detalle.id,
    importe: detalle.importe,
    alerta_precio,
    precio_acordado: precio?.precio_acordado ?? null,
  })
}
