// POST   /api/contabilidad/pagos      — registra un abono de una boleta.
// DELETE /api/contabilidad/pagos?id=…  — borra un abono.
//
// Sólo Contabilidad (la RLS de entrada_pago es la barrera real). El total
// pagado de la boleta lo recalcula el trigger sumando los abonos: aquí no se
// escribe ningún total a mano.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionResult } from '@/lib/session'

const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
const txt = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

function guard(rol: string) {
  return rol === 'admin' || rol === 'contador'
}

export async function POST(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!guard(r.session.rol)) {
    return NextResponse.json({ error: 'Sólo Contabilidad puede registrar pagos.' }, { status: 403 })
  }

  const b = await request.json().catch(() => null)
  const entrada_id = txt(b?.entrada_id)
  const monto = num(b?.monto)
  if (!entrada_id) return NextResponse.json({ error: 'Falta la boleta' }, { status: 400 })
  if (monto == null || monto <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entrada_pago')
    .insert({
      entrada_id,
      org_id: r.session.orgId,
      fecha: txt(b?.fecha) ?? new Date().toISOString().slice(0, 10),
      monto,
      metodo: txt(b?.metodo),
      referencia: txt(b?.referencia),
      observaciones: txt(b?.observaciones),
      registrado_por: r.session.userId,
    })
    .select('id, fecha, monto, metodo, referencia, observaciones')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // El trigger ya actualizó el total; lo devolvemos para refrescar la pantalla.
  const { data: costo } = await supabase
    .from('entrada_costo')
    .select('importe_pagado')
    .eq('entrada_id', entrada_id)
    .maybeSingle()

  return NextResponse.json({ ok: true, pago: data, importe_pagado: costo?.importe_pagado ?? 0 })
}

export async function DELETE(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!guard(r.session.rol)) {
    return NextResponse.json({ error: 'Sólo Contabilidad puede borrar pagos.' }, { status: 403 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el pago' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('entrada_pago').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
