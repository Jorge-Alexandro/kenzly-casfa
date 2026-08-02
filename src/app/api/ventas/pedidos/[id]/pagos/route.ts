// POST   /api/ventas/pedidos/[id]/pagos      — registra un abono del pedido.
// DELETE /api/ventas/pedidos/[id]/pagos?id=… — borra un abono.
// Espejo exacto de /api/contabilidad/pagos. El importe_pagado del pedido lo
// recalcula el trigger (0053) sumando los abonos — no se escribe a mano.
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
  const monto = num(b?.monto)
  if (monto == null || monto <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_pago')
    .insert({
      pedido_id: params.id,
      org_id: session.orgId,
      fecha: txt(b?.fecha) ?? new Date().toISOString().slice(0, 10),
      monto,
      metodo: txt(b?.metodo),
      referencia: txt(b?.referencia),
      observaciones: txt(b?.observaciones),
      registrado_por: session.userId,
    })
    .select('id, fecha, monto, metodo, referencia, observaciones')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { data: pedido } = await supabase
    .from('ventas_pedido')
    .select('importe_pagado')
    .eq('id', params.id)
    .maybeSingle()

  return NextResponse.json({ ok: true, pago: data, importe_pagado: pedido?.importe_pagado ?? 0 })
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el pago' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('ventas_pago').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
