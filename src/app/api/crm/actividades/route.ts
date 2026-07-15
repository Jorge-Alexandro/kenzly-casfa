// POST  /api/crm/actividades — registrar actividad (llamada/visita/correo/
//   whatsapp/tarea/nota). Si viene oportunidad_id sin cuenta_id, la cuenta se
//   deriva en servidor de la oportunidad (no se confía en el cliente).
// PATCH /api/crm/actividades — accion 'completar' (con resultado opcional),
//   'reabrir', o edición de campos.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEditorCRM, textoOpcional } from '@/lib/crm/guard'
import { TIPOS_ACTIVIDAD, type TipoActividad } from '@/lib/crm/tipos'

function fechaHoraOpcional(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export async function POST(request: Request) {
  const guard = await requireEditorCRM()
  if (!guard.ok) return guard.res

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const tipo = String(body.tipo ?? '') as TipoActividad
  const asunto = String(body.asunto ?? '').trim()
  if (!TIPOS_ACTIVIDAD.includes(tipo)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  if (!asunto) return NextResponse.json({ error: 'El asunto es obligatorio' }, { status: 400 })

  const supabase = await createClient()
  let cuenta_id = textoOpcional(body.cuenta_id)
  const oportunidad_id = textoOpcional(body.oportunidad_id)

  if (oportunidad_id) {
    const { data: opp } = await supabase
      .from('crm_oportunidad')
      .select('id, cuenta_id')
      .eq('id', oportunidad_id)
      .maybeSingle()
    if (!opp) return NextResponse.json({ error: 'Oportunidad no encontrada' }, { status: 400 })
    cuenta_id = opp.cuenta_id // la cuenta manda: siempre la de la oportunidad
  }
  if (!cuenta_id) return NextResponse.json({ error: 'Falta la cuenta' }, { status: 400 })

  const { data: cuenta } = await supabase.from('crm_cuenta').select('id').eq('id', cuenta_id).maybeSingle()
  if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 400 })

  // Las notas quedan completadas al registrarse; el resto son pendientes.
  const completada = tipo === 'nota' || body.completada === true

  const { data, error } = await supabase
    .from('crm_actividad')
    .insert({
      org_id: guard.session.orgId,
      cuenta_id,
      oportunidad_id,
      tipo,
      asunto,
      descripcion: textoOpcional(body.descripcion),
      fecha_programada: fechaHoraOpcional(body.fecha_programada),
      completada_at: completada ? new Date().toISOString() : null,
      resultado: completada ? textoOpcional(body.resultado) : null,
      responsable_id: textoOpcional(body.responsable_id) ?? guard.session.userId,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(request: Request) {
  const guard = await requireEditorCRM()
  if (!guard.ok) return guard.res

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'Falta id de la actividad' }, { status: 400 })

  const supabase = await createClient()
  const { data: act } = await supabase.from('crm_actividad').select('id').eq('id', id).maybeSingle()
  if (!act) return NextResponse.json({ error: 'Actividad no encontrada' }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if (body.accion === 'completar') {
    patch.completada_at = new Date().toISOString()
    patch.resultado = textoOpcional(body.resultado)
  } else if (body.accion === 'reabrir') {
    patch.completada_at = null
    patch.resultado = null
  } else {
    if (body.asunto !== undefined) {
      const asunto = String(body.asunto ?? '').trim()
      if (!asunto) return NextResponse.json({ error: 'El asunto es obligatorio' }, { status: 400 })
      patch.asunto = asunto
    }
    if (body.descripcion !== undefined) patch.descripcion = textoOpcional(body.descripcion)
    if (body.fecha_programada !== undefined) patch.fecha_programada = fechaHoraOpcional(body.fecha_programada)
    if (body.responsable_id !== undefined) patch.responsable_id = textoOpcional(body.responsable_id)
    if (body.tipo !== undefined) {
      const tipo = String(body.tipo) as TipoActividad
      if (!TIPOS_ACTIVIDAD.includes(tipo)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
      patch.tipo = tipo
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }
  const { error } = await supabase.from('crm_actividad').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
