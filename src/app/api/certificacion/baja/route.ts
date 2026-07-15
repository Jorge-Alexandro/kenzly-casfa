// Bajas de productor.
//   POST   /api/certificacion/baja  { productor_id, tipo, motivo?, fecha?, anio?, nivel_al_baja? }
//   DELETE /api/certificacion/baja?productor_id=...   (reactivar)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

const TIPOS = ['voluntaria', 'defuncion', 'sancion', 'otro']

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.productor_id) return NextResponse.json({ error: 'Falta productor' }, { status: 400 })
  const tipo = TIPOS.includes(body.tipo) ? body.tipo : 'voluntaria'

  const supabase = await createClient()
  const { error } = await supabase.from('productor_baja').upsert(
    {
      org_id: session.orgId,
      productor_id: body.productor_id,
      tipo,
      motivo: body.motivo ?? null,
      fecha: body.fecha || undefined,
      anio: body.anio ?? null,
      nivel_al_baja: body.nivel_al_baja ?? null,
    },
    { onConflict: 'productor_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const productorId = new URL(request.url).searchParams.get('productor_id')
  if (!productorId) return NextResponse.json({ error: 'Falta productor_id' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('productor_baja').delete().eq('productor_id', productorId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
