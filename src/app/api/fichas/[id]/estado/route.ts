// POST /api/fichas/[id]/estado — cambia el estado de una ficha respetando el
// flujo y los permisos por rol. Body: { estado }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { accionesPermitidas } from '@/lib/ficha-workflow'
import type { EstadoFicha } from '@/lib/types'

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const nuevo = body?.estado as EstadoFicha | undefined
  if (!nuevo) {
    return NextResponse.json({ error: 'Falta el estado' }, { status: 400 })
  }

  const supabase = await createClient()

  // Estado actual (RLS garantiza acceso a la org).
  const { data: ficha, error: fErr } = await supabase
    .from('fichas')
    .select('id, estado')
    .eq('id', params.id)
    .maybeSingle()
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 400 })
  if (!ficha) {
    return NextResponse.json({ error: 'Ficha no encontrada' }, { status: 404 })
  }

  // ¿La transición es válida para este rol desde el estado actual?
  const permitidas = accionesPermitidas(ficha.estado as EstadoFicha, session.rol)
  if (!permitidas.some((a) => a.to === nuevo)) {
    return NextResponse.json(
      { error: 'Transición no permitida para tu rol' },
      { status: 403 },
    )
  }

  const { error } = await supabase
    .from('fichas')
    .update({ estado: nuevo, updated_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, estado: nuevo })
}
