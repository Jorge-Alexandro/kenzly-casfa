// POST   /api/contratos/[id]/firma-link — genera (o devuelve) la liga de firma
//                                          remota del vendedor.
// DELETE /api/contratos/[id]/firma-link — revoca la liga (invalida el token).
//
// La liga lleva un token UUID que da acceso SÓLO a firmar ese contrato como
// vendedor. Sólo un editor comercial la genera; cualquiera con la liga firma.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionResult } from '@/lib/session'
import { esSupervisor } from '@/lib/acopio/estado'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!esSupervisor(r.session.rol)) {
    return NextResponse.json({ error: 'Sólo un supervisor puede generar la liga.' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: c, error: cErr } = await supabase
    .from('contrato_fijacion')
    .select('id, firma_token')
    .eq('id', params.id)
    .maybeSingle()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 })
  if (!c) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })

  let token = c.firma_token as string | null
  if (!token) {
    token = crypto.randomUUID()
    const { error } = await supabase
      .from('contrato_fijacion')
      .update({ firma_token: token, updated_at: new Date().toISOString() })
      .eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const origin = new URL(request.url).origin
  return NextResponse.json({ ok: true, token, url: `${origin}/firmar/${token}` })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!esSupervisor(r.session.rol)) {
    return NextResponse.json({ error: 'Sólo un supervisor puede revocar la liga.' }, { status: 403 })
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('contrato_fijacion')
    .update({ firma_token: null, updated_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
