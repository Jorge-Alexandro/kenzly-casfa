// POST /api/asistencia — crea una lista de asistencia (el folio lo pone el
// trigger por organización). Body: { nombre_evento, fecha?, lugar?, capacitador? }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const nombre_evento = String(body?.nombre_evento ?? '').trim()
  if (!nombre_evento) {
    return NextResponse.json({ error: 'Escribe el nombre del evento' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('asistencia_lista')
    .insert({
      org_id: session.orgId,
      nombre_evento,
      fecha: body?.fecha || undefined,
      lugar: body?.lugar?.trim() || null,
      capacitador: body?.capacitador?.trim() || null,
      created_by: session.userId,
    })
    .select('id, folio')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, id: data.id, folio: data.folio })
}
