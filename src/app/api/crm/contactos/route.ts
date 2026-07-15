// POST  /api/crm/contactos — alta de contacto en una cuenta.
// PATCH /api/crm/contactos — edición; si principal=true, des-marca al anterior
//   (la BD garantiza a lo más un principal por cuenta con índice único parcial).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEditorCRM, textoOpcional } from '@/lib/crm/guard'

function camposContacto(body: Record<string, unknown>, parcial = false) {
  const keys = ['puesto', 'telefono', 'email', 'whatsapp', 'notas'] as const
  const out: Record<string, string | null> = {}
  for (const k of keys) {
    if (!parcial || body[k] !== undefined) out[k] = textoOpcional(body[k])
  }
  return out
}

async function desmarcarPrincipal(supabase: Awaited<ReturnType<typeof createClient>>, cuentaId: string) {
  await supabase.from('crm_contacto').update({ principal: false }).eq('cuenta_id', cuentaId).eq('principal', true)
}

export async function POST(request: Request) {
  const guard = await requireEditorCRM()
  if (!guard.ok) return guard.res

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const cuenta_id = String(body.cuenta_id ?? '')
  const nombre = String(body.nombre ?? '').trim()
  if (!cuenta_id) return NextResponse.json({ error: 'Falta la cuenta' }, { status: 400 })
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  const supabase = await createClient()
  const { data: cuenta } = await supabase.from('crm_cuenta').select('id').eq('id', cuenta_id).maybeSingle()
  if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 400 })

  const principal = body.principal === true
  if (principal) await desmarcarPrincipal(supabase, cuenta_id)

  const { data, error } = await supabase
    .from('crm_contacto')
    .insert({
      org_id: guard.session.orgId,
      cuenta_id,
      nombre,
      principal,
      ...camposContacto(body),
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
  if (!id) return NextResponse.json({ error: 'Falta id del contacto' }, { status: 400 })

  const supabase = await createClient()
  const { data: contacto } = await supabase
    .from('crm_contacto')
    .select('id, cuenta_id')
    .eq('id', id)
    .maybeSingle()
  if (!contacto) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 })

  const patch: Record<string, unknown> = camposContacto(body, true)
  if (body.nombre !== undefined) {
    const nombre = String(body.nombre ?? '').trim()
    if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    patch.nombre = nombre
  }
  if (body.principal !== undefined) {
    patch.principal = body.principal === true
    if (patch.principal) await desmarcarPrincipal(supabase, contacto.cuenta_id)
  }

  const { error } = await supabase.from('crm_contacto').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
