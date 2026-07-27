// POST /api/asistencia/[id]/registro — un participante se registra en la lista.
// El número consecutivo dentro de la lista lo pone el trigger.
// Body: { nombre_completo, organizacion?, sexo?, cargo?, telefono?, correo?, firma_url? }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const nombre = String(body?.nombre_completo ?? '').trim()
  if (!nombre) return NextResponse.json({ error: 'Falta el nombre del participante' }, { status: 400 })

  const supabase = await createClient()

  // La lista debe existir (RLS) y no estar cerrada.
  const { data: lista } = await supabase
    .from('asistencia_lista')
    .select('id, cerrada')
    .eq('id', params.id)
    .maybeSingle()
  if (!lista) return NextResponse.json({ error: 'Lista no encontrada' }, { status: 404 })
  if (lista.cerrada) return NextResponse.json({ error: 'La lista ya está cerrada' }, { status: 409 })

  const { data, error } = await supabase
    .from('asistencia_registro')
    .insert({
      org_id: session.orgId,
      lista_id: params.id,
      nombre_completo: nombre,
      organizacion: body?.organizacion?.trim() || null,
      sexo: body?.sexo?.trim() || null,
      cargo: body?.cargo?.trim() || null,
      telefono: body?.telefono?.trim() || null,
      correo: body?.correo?.trim() || null,
      firma_url: body?.firma_url || null,
    })
    .select('id, numero, nombre_completo, organizacion, sexo, cargo, telefono, correo, firma_url')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, registro: data })
}
