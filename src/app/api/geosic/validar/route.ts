// POST /api/geosic/validar
// Coordinator/admin approves or reverts a polygon validation.
// Body: { poligono_id, accion: 'aprobar' | 'rechazar' }
// Enforced server-side: only admin/coordinador roles may validate.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (session.rol !== 'admin' && session.rol !== 'coordinador') {
    return NextResponse.json(
      { error: 'No tienes permiso para validar polígonos' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  const poligonoId = body?.poligono_id
  const accion = body?.accion

  if (typeof poligonoId !== 'string' || !poligonoId) {
    return NextResponse.json({ error: 'Falta poligono_id' }, { status: 400 })
  }
  if (accion !== 'aprobar' && accion !== 'rechazar') {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  }

  const supabase = await createClient()

  // RPC: sets estado_validacion to 'validado' (aprobar) or recomputes from the
  // trigger logic (rechazar). RLS still applies — user must be org member.
  const { data, error } = await supabase.rpc('validar_poligono', {
    p_poligono_id: poligonoId,
    p_aprobar: accion === 'aprobar',
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, poligono: data })
}
