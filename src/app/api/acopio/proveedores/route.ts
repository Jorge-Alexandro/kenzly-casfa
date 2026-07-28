// POST  /api/acopio/proveedores      — alta de un proveedor del padrón de ACOPIO
//                                       (cualquier miembro, desde la captura).
// PATCH /api/acopio/proveedores?id=…  — cambia el tipo (sociedad/individual);
//                                       sólo Contabilidad, porque decide cómo se
//                                       agrupa el acopio por cooperativa.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession, getSessionResult } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const nombre = String(body?.nombre ?? '').trim()
  if (!nombre) return NextResponse.json({ error: 'Falta el nombre del proveedor' }, { status: 400 })

  const supabase = await createClient()

  // Reactivar si ya existía (unique org_id,nombre).
  const { data: existente } = await supabase
    .from('acopio_proveedor')
    .select('id')
    .eq('nombre', nombre)
    .maybeSingle()
  if (existente) {
    await supabase.from('acopio_proveedor').update({ activo: true }).eq('id', existente.id)
    return NextResponse.json({
      ok: true,
      proveedor: {
        id: existente.id,
        codigo: '',
        nombre_completo: nombre,
        comunidad: body?.comunidad?.trim() || null,
        municipio: body?.municipio?.trim() || null,
      },
    })
  }

  const { data, error } = await supabase
    .from('acopio_proveedor')
    .insert({
      org_id: session.orgId,
      nombre,
      comunidad: body?.comunidad?.trim() || null,
      municipio: body?.municipio?.trim() || null,
    })
    .select('id, nombre, comunidad, municipio')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    ok: true,
    proveedor: {
      id: data.id,
      codigo: '',
      nombre_completo: data.nombre,
      comunidad: data.comunidad,
      municipio: data.municipio,
    },
  })
}

export async function PATCH(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (r.session.rol !== 'admin' && r.session.rol !== 'contador') {
    return NextResponse.json({ error: 'Sólo Contabilidad puede clasificar proveedores.' }, { status: 403 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el proveedor' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const tipo = String(body?.tipo_persona ?? '')
  if (tipo !== 'moral' && tipo !== 'fisica') {
    return NextResponse.json({ error: 'Tipo inválido (moral o fisica)' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('acopio_proveedor')
    .update({ tipo_persona: tipo })
    .eq('id', id)
    .select('id, nombre, tipo_persona')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, proveedor: data })
}
