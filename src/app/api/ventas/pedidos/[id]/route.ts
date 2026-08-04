// PATCH  /api/ventas/pedidos/[id] — editar notas, o cancelar el pedido.
// DELETE /api/ventas/pedidos/[id] — borrarlo por completo.
//
// CANCELAR y BORRAR no son lo mismo, a propósito:
//   · Cancelar deja el registro con su motivo — es historia ("esta venta
//     existió y se cayó"). Repone inventario y NO toca la factura.
//   · Borrar lo quita como si nunca hubiera existido, con todo y sus pagos y
//     facturas (cascada de la BD). Es para corregir capturas equivocadas o de
//     prueba. Repone inventario por el mismo trigger de stock (0018).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const supabase = await createClient()

  if (body.accion === 'cancelar') {
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''
    if (!motivo) return NextResponse.json({ error: 'Escribe el motivo de la cancelación' }, { status: 400 })

    const { data: pedido } = await supabase.from('ventas_pedido').select('id, estado').eq('id', params.id).maybeSingle()
    if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    if (pedido.estado === 'cancelada') return NextResponse.json({ error: 'Ese pedido ya está cancelado' }, { status: 400 })

    // Borra las líneas primero (repone stock vía trigger) y luego marca el pedido.
    const { error: dErr } = await supabase.from('ventas_detalle').delete().eq('pedido_id', params.id)
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 })

    const { error: uErr } = await supabase
      .from('ventas_pedido')
      .update({ estado: 'cancelada', motivo_cancelacion: motivo })
      .eq('id', params.id)
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  }

  if ('notas' in body) {
    const notas = typeof body.notas === 'string' && body.notas.trim() ? body.notas.trim() : null
    const { error } = await supabase.from('ventas_pedido').update({ notas }).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = await createClient()

  // Las líneas se borran explícitamente (no sólo por cascada) para que el
  // trigger de stock corra y reponga el inventario antes de quitar el pedido.
  const { error: dErr } = await supabase.from('ventas_detalle').delete().eq('pedido_id', params.id)
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 })

  const { error } = await supabase.from('ventas_pedido').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
