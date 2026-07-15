// POST /api/certificados — actualiza fecha de vencimiento / estado de un
// certificado (programa × esquema). Body: { id, fecha_vencimiento?, estado? }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('fecha_vencimiento' in body) patch.fecha_vencimiento = body.fecha_vencimiento || null
  if ('estado' in body) patch.estado = body.estado || null

  const supabase = await createClient()
  const { error } = await supabase.from('certificado').update(patch).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
