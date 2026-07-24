// POST   /api/contabilidad/facturas      — registra una factura de una boleta.
// DELETE /api/contabilidad/facturas?id=… — borra una factura.
// Sólo Contabilidad; la RLS de entrada_factura es la barrera real.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionResult } from '@/lib/session'

const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
const txt = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

const guard = (rol: string) => rol === 'admin' || rol === 'contador'

export async function POST(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!guard(r.session.rol)) {
    return NextResponse.json({ error: 'Sólo Contabilidad puede registrar facturas.' }, { status: 403 })
  }

  const b = await request.json().catch(() => null)
  const entrada_id = txt(b?.entrada_id)
  const folio = txt(b?.folio)
  if (!entrada_id) return NextResponse.json({ error: 'Falta la boleta' }, { status: 400 })
  if (!folio) return NextResponse.json({ error: 'Falta el folio de la factura' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entrada_factura')
    .insert({
      entrada_id,
      org_id: r.session.orgId,
      folio,
      fecha: txt(b?.fecha),
      monto: num(b?.monto),
      uuid_fiscal: txt(b?.uuid_fiscal),
      observaciones: txt(b?.observaciones),
      registrado_por: r.session.userId,
    })
    .select('id, folio, fecha, monto, uuid_fiscal')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, factura: data })
}

export async function DELETE(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!guard(r.session.rol)) {
    return NextResponse.json({ error: 'Sólo Contabilidad puede borrar facturas.' }, { status: 403 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta la factura' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('entrada_factura').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
