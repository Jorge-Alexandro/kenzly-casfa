// POST  /api/crm/cuentas — alta de cuenta comercial (prospecto sin RFC).
// PATCH /api/crm/cuentas — edición de campos, o acción 'vincular_ventas_cliente'
//   que conecta la cuenta con un cliente fiscal existente o crea uno nuevo
//   (con RFC único por org). NUNCA crea ventas: Ventas sigue siendo la fuente
//   de verdad de operaciones cerradas.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEditorCRM, textoOpcional } from '@/lib/crm/guard'

const TIPOS = ['prospecto', 'cliente']
const ESTATUS = ['activo', 'inactivo', 'descartado']

// Campos editables (whitelist — cualquier otra cosa del body se ignora).
// parcial=true (PATCH): solo incluye las llaves que el body trae, para no
// vaciar campos que el formulario no mandó.
const CAMPOS_TEXTO = [
  'nombre_comercial', 'segmento', 'origen', 'telefono', 'email',
  'sitio_web', 'direccion', 'responsable_id', 'notas',
] as const

function camposCuenta(body: Record<string, unknown>, parcial = false) {
  const out: Record<string, string | null> = {}
  for (const k of CAMPOS_TEXTO) {
    if (!parcial || body[k] !== undefined) out[k] = textoOpcional(body[k])
  }
  return out
}

export async function POST(request: Request) {
  const guard = await requireEditorCRM()
  if (!guard.ok) return guard.res

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const nombre = String(body.nombre ?? '').trim()
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  const tipo = TIPOS.includes(String(body.tipo)) ? String(body.tipo) : 'prospecto'
  const estatus = ESTATUS.includes(String(body.estatus)) ? String(body.estatus) : 'activo'

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('crm_cuenta')
    .insert({
      org_id: guard.session.orgId,
      nombre,
      tipo,
      estatus,
      ...camposCuenta(body),
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
  if (!id) return NextResponse.json({ error: 'Falta id de la cuenta' }, { status: 400 })

  const supabase = await createClient()
  // RLS acota a la org: un id ajeno simplemente no aparece.
  const { data: cuenta } = await supabase
    .from('crm_cuenta')
    .select('id, ventas_cliente_id')
    .eq('id', id)
    .maybeSingle()
  if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })

  // --- Acción especial: vincular / crear cliente fiscal ---
  if (body.accion === 'vincular_ventas_cliente') {
    let clienteId = textoOpcional(body.cliente_id)

    if (!clienteId) {
      // Crear cliente fiscal nuevo: RFC obligatorio y único en la org.
      const rfc = String(body.rfc ?? '').trim().toUpperCase()
      const nombreFiscal = String(body.nombre_fiscal ?? body.nombre ?? '').trim()
      if (!rfc || rfc.length < 12 || rfc.length > 13) {
        return NextResponse.json({ error: 'RFC inválido (12–13 caracteres)' }, { status: 400 })
      }
      if (!nombreFiscal) {
        return NextResponse.json({ error: 'Falta la razón social del cliente fiscal' }, { status: 400 })
      }
      const { data: existente } = await supabase
        .from('ventas_cliente')
        .select('id, nombre')
        .eq('rfc', rfc)
        .maybeSingle()
      if (existente) {
        return NextResponse.json(
          { error: `Ese RFC ya existe en la organización (${existente.nombre}). Vincula el cliente existente.` },
          { status: 409 },
        )
      }
      const { data: nuevo, error: cErr } = await supabase
        .from('ventas_cliente')
        .insert({
          org_id: guard.session.orgId,
          rfc,
          nombre: nombreFiscal,
          regimen_fiscal: textoOpcional(body.regimen_fiscal),
        })
        .select('id')
        .single()
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 })
      clienteId = nuevo.id
    } else {
      // Vincular existente: verificar que el id es visible (misma org por RLS).
      const { data: cli } = await supabase
        .from('ventas_cliente')
        .select('id')
        .eq('id', clienteId)
        .maybeSingle()
      if (!cli) return NextResponse.json({ error: 'Cliente fiscal no encontrado' }, { status: 400 })
    }

    const { error: uErr } = await supabase
      .from('crm_cuenta')
      .update({ ventas_cliente_id: clienteId, tipo: 'cliente' })
      .eq('id', id)
    if (uErr) {
      // unique parcial (org_id, ventas_cliente_id): ya hay otra cuenta ligada
      const msg = uErr.message.includes('crm_cuenta_ventas_cliente_uk')
        ? 'Ese cliente fiscal ya está vinculado a otra cuenta CRM'
        : uErr.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ ok: true, ventas_cliente_id: clienteId })
  }

  // --- Edición normal de campos ---
  const patch: Record<string, unknown> = camposCuenta(body, true)
  if (body.nombre !== undefined) {
    const nombre = String(body.nombre ?? '').trim()
    if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    patch.nombre = nombre
  }
  if (body.tipo !== undefined && TIPOS.includes(String(body.tipo))) patch.tipo = String(body.tipo)
  if (body.estatus !== undefined && ESTATUS.includes(String(body.estatus))) patch.estatus = String(body.estatus)

  const { error } = await supabase.from('crm_cuenta').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
