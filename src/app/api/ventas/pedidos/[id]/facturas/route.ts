// POST   /api/ventas/pedidos/[id]/facturas      — liga evidencia de factura al pedido.
// DELETE /api/ventas/pedidos/[id]/facturas?id=… — la quita.
// Espejo exacto de /api/contabilidad/facturas. Sólo folio/fecha/monto/uuid —
// esto NUNCA toca ventas_detalle ni inventario (ver 0053_ventas_pedidos.sql).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
const txt = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const b = await request.json().catch(() => null)
  const folio = txt(b?.folio)
  if (!folio) return NextResponse.json({ error: 'Falta el folio de la factura' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_pedido_factura')
    .insert({
      pedido_id: params.id,
      org_id: session.orgId,
      folio,
      fecha: txt(b?.fecha),
      monto: num(b?.monto),
      uuid_fiscal: txt(b?.uuid_fiscal),
      observaciones: txt(b?.observaciones),
      registrado_por: session.userId,
    })
    .select('id, folio, fecha, monto, uuid_fiscal, observaciones')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, factura: data })
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta la factura' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('ventas_pedido_factura').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
