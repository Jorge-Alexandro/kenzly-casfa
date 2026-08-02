// POST   /api/ventas/movimientos      — registra un movimiento de inventario
//        que NO es venta (regalía, cortesía, merma, ajuste, entrada).
// DELETE /api/ventas/movimientos?id=… — lo borra (revierte el stock).
// El trigger de la BD (0054) es quien realmente mueve ventas_stock — aquí
// sólo se valida y se inserta/borra la fila.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

const TIPOS = ['regalia', 'cortesia', 'merma', 'ajuste_mas', 'ajuste_menos', 'entrada']

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const b = await request.json().catch(() => null)
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const producto_id = String(b.producto_id ?? '')
  const tipo = String(b.tipo ?? '')
  const cantidad = Number(b.cantidad)
  const cliente_id = typeof b.cliente_id === 'string' && b.cliente_id ? b.cliente_id : null
  const motivo = typeof b.motivo === 'string' && b.motivo.trim() ? b.motivo.trim() : null
  const fecha = String(b.fecha ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10)

  if (!producto_id) return NextResponse.json({ error: 'Falta el producto' }, { status: 400 })
  if (!TIPOS.includes(tipo)) return NextResponse.json({ error: 'Tipo de movimiento inválido' }, { status: 400 })
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 })
  }
  if (cliente_id && tipo !== 'regalia' && tipo !== 'cortesia') {
    return NextResponse.json({ error: 'Sólo regalía o cortesía pueden llevar cliente' }, { status: 400 })
  }
  if (tipo === 'merma' && !motivo) {
    return NextResponse.json({ error: 'La merma necesita un motivo' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: prod } = await supabase.from('ventas_producto').select('id').eq('id', producto_id).maybeSingle()
  if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 400 })

  const { data, error } = await supabase
    .from('ventas_movimiento')
    .insert({
      org_id: session.orgId,
      producto_id,
      tipo,
      cantidad,
      cliente_id,
      fecha,
      motivo,
      registrado_por: session.userId,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, id: data.id })
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el movimiento' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('ventas_movimiento').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
