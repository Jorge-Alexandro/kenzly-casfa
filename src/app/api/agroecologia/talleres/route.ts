// POST /api/agroecologia/talleres — captura un taller (el evento).
// Body: { programa_id, tipo_taller_id, comunidad_id?, comunidad?, municipio?,
//          fecha, hora_inicio?, hora_fin?, tecnico?, notas? }
//
// Es lo único que se teclea por reunión: la plantilla (introducción,
// objetivos, desarrollo…) ya vive en agro_plantilla_taller y no se repite.
// Acepta una comunidad del catálogo (comunidad_id) O una nueva/no catalogada
// (comunidad + municipio en texto) — el nombre se guarda como snapshot en
// cualquier caso, igual que el proveedor de una boleta de acopio.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

const txt = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const b = await request.json().catch(() => null)
  const programa_id = txt(b?.programa_id)
  const tipo_taller_id = txt(b?.tipo_taller_id)
  const fecha = txt(b?.fecha)
  if (!programa_id || !tipo_taller_id) {
    return NextResponse.json({ error: 'Falta el programa o el tipo de taller' }, { status: 400 })
  }
  if (!fecha) return NextResponse.json({ error: 'Falta la fecha' }, { status: 400 })

  const supabase = await createClient()

  let comunidad_id = txt(b?.comunidad_id)
  let comunidad = txt(b?.comunidad)
  let municipio = txt(b?.municipio)

  if (comunidad_id) {
    const { data: com, error: cErr } = await supabase
      .from('agro_comunidad')
      .select('comunidad, municipio, programa_id')
      .eq('id', comunidad_id)
      .maybeSingle()
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 })
    if (!com) return NextResponse.json({ error: 'Comunidad no encontrada' }, { status: 404 })
    if (com.programa_id !== programa_id) {
      return NextResponse.json({ error: 'La comunidad no pertenece a ese programa' }, { status: 400 })
    }
    comunidad = com.comunidad
    municipio = com.municipio
  }
  if (!comunidad) return NextResponse.json({ error: 'Falta la comunidad' }, { status: 400 })

  const { data, error } = await supabase
    .from('agro_taller')
    .insert({
      org_id: session.orgId,
      programa_id,
      tipo_taller_id,
      comunidad_id,
      comunidad,
      municipio,
      fecha,
      hora_inicio: txt(b?.hora_inicio),
      hora_fin: txt(b?.hora_fin),
      tecnico: txt(b?.tecnico),
      notas: txt(b?.notas),
      created_by: session.userId,
    })
    .select('id')
    .single()

  if (error) {
    // Choque del índice único (mismo taller, misma comunidad, mismo día).
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Ya existe un taller de ese tipo en esa comunidad con esa fecha.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, id: data.id })
}
