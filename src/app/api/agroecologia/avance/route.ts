// POST /api/agroecologia/avance — upsert de una celda (comunidad × tipo taller).
// El servidor recalcula avance=(f+m)/socios con los socios de la comunidad.
// Body: { comunidad_id, tipo_taller_id, f, m, impartido? }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { avanceCelda } from '@/lib/agroecologia/programa-tipos'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.comunidad_id || !body?.tipo_taller_id) {
    return NextResponse.json({ error: 'Falta comunidad o tipo de taller' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: com, error: cErr } = await supabase
    .from('agro_comunidad')
    .select('id, programa_id, socios')
    .eq('id', body.comunidad_id)
    .maybeSingle()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 })
  if (!com) return NextResponse.json({ error: 'Comunidad no encontrada' }, { status: 404 })

  const f = Math.max(0, Number(body.f) || 0)
  const m = Math.max(0, Number(body.m) || 0)
  const avance = avanceCelda(f, m, com.socios)
  const impartido = body.impartido != null ? !!body.impartido : f + m > 0

  const { error } = await supabase.from('agro_avance').upsert(
    {
      org_id: session.orgId,
      programa_id: com.programa_id,
      comunidad_id: com.id,
      tipo_taller_id: body.tipo_taller_id,
      f,
      m,
      avance,
      impartido,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'comunidad_id,tipo_taller_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, avance, impartido })
}
