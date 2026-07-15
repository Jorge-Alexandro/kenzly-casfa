// POST /api/certificacion/estatus — fija (upsert) el nivel de un productor en
// un año. Body: { productor_id, anio, nivel, origen?, motivo? }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

const NIVELES = ['nuevo', 't1', 't2', 't3', 'organico']

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const anio = Number(body.anio)
  if (!body.productor_id || !Number.isInteger(anio)) {
    return NextResponse.json({ error: 'Falta productor o año' }, { status: 400 })
  }
  if (!NIVELES.includes(body.nivel)) {
    return NextResponse.json({ error: 'Nivel inválido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('certificacion_estatus').upsert(
    {
      org_id: session.orgId,
      productor_id: body.productor_id,
      anio,
      nivel: body.nivel,
      origen: body.origen ?? 'ratificacion',
      motivo: body.motivo ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'productor_id,anio' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
