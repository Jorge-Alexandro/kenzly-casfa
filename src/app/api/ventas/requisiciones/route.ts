// POST   /api/ventas/requisiciones      — crea una requisición con sus items.
// DELETE /api/ventas/requisiciones?id=… — la borra (cascada a sus items).
// No toca inventario: es el papeleo interno para torrefacción, el stock lo
// gobiernan la venta capturada (Fase 4) y los movimientos (Fase 5).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

interface ItemBody {
  producto_id?: unknown
  cantidad?: unknown
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const b = await request.json().catch(() => null)
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const itemsBody = Array.isArray(b.items) ? (b.items as ItemBody[]) : []
  const items = itemsBody
    .map((it) => ({ producto_id: String(it.producto_id ?? ''), cantidad: Number(it.cantidad) }))
    .filter((it) => it.producto_id && Number.isFinite(it.cantidad) && it.cantidad > 0)
  if (items.length === 0) {
    return NextResponse.json({ error: 'Agrega al menos un producto con cantidad' }, { status: 400 })
  }

  const fecha = String(b.fecha ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10)
  const clienteId = typeof b.cliente_id === 'string' && b.cliente_id ? b.cliente_id : null
  const clienteTexto = typeof b.cliente_texto === 'string' && b.cliente_texto.trim() ? b.cliente_texto.trim() : null
  const pedidoId = typeof b.pedido_id === 'string' && b.pedido_id ? b.pedido_id : null
  const solicito = typeof b.solicito === 'string' ? b.solicito.trim() || null : null
  const autorizo = typeof b.autorizo === 'string' ? b.autorizo.trim() || null : null
  const entrego = typeof b.entrego === 'string' ? b.entrego.trim() || null : 'Almacén'
  const notas = typeof b.notas === 'string' ? b.notas.trim() || null : null

  const supabase = await createClient()
  const { data: req_, error } = await supabase
    .from('ventas_requisicion')
    .insert({
      org_id: session.orgId,
      fecha,
      cliente_id: clienteId,
      cliente_texto: clienteTexto,
      pedido_id: pedidoId,
      solicito,
      autorizo,
      entrego,
      notas,
      created_by: session.userId,
    })
    .select('id, folio')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { error: itemsErr } = await supabase.from('ventas_requisicion_item').insert(
    items.map((it) => ({
      org_id: session.orgId,
      requisicion_id: req_.id,
      producto_id: it.producto_id,
      cantidad: it.cantidad,
    })),
  )
  if (itemsErr) {
    await supabase.from('ventas_requisicion').delete().eq('id', req_.id)
    return NextResponse.json({ error: itemsErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, id: req_.id, folio: req_.folio })
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta la requisición' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('ventas_requisicion').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
