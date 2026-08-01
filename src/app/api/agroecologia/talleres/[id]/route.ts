// PATCH  /api/agroecologia/talleres/[id] — edita horas/técnico/notas/lista.
// DELETE /api/agroecologia/talleres/[id] — borra el taller (y sus fotos, cascade).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

const txt = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const b = await request.json().catch(() => null)
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const c of ['hora_inicio', 'hora_fin', 'tecnico', 'notas', 'observaciones'] as const) {
    if (b && Object.prototype.hasOwnProperty.call(b, c)) cambios[c] = txt(b[c])
  }
  if (b && Object.prototype.hasOwnProperty.call(b, 'lista_id')) {
    cambios.lista_id = txt(b.lista_id)
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agro_taller')
    .update(cambios)
    .eq('id', params.id)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = await createClient()
  const { error } = await supabase.from('agro_taller').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
