// POST /api/agroecologia/comunidad — edita datos de una comunidad del programa
// (socios, hectáreas, plantas entregadas, abono). Alimenta los KPIs.
// Body: { id, socios?, hectareas?, plantas_entregadas?, abono_ton? }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const patch: Record<string, number> = {}
  if (body.socios != null) patch.socios = Math.max(0, Math.trunc(Number(body.socios)) || 0)
  if (body.hectareas != null) patch.hectareas = Math.max(0, Number(body.hectareas) || 0)
  if (body.plantas_entregadas != null)
    patch.plantas_entregadas = Math.max(0, Math.trunc(Number(body.plantas_entregadas)) || 0)
  if (body.abono_ton != null) patch.abono_ton = Math.max(0, Number(body.abono_ton) || 0)
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('agro_comunidad').update(patch).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
