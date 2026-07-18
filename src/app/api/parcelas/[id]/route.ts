// PATCH /api/parcelas/[id] — edit a parcela's editable fields.
// Only admin/coordinador may edit catalogs.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import type { ParcelaEdit } from '@/lib/types'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  // El SIC corrige datos de la parcela en campo (todos los roles), como el alta.

  const body = (await request.json().catch(() => null)) as ParcelaEdit | null
  if (!body) {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  // superficie_declarada_ha must be a non-negative number or null.
  let superficie: number | null = null
  if (body.superficie_declarada_ha !== null && body.superficie_declarada_ha !== undefined) {
    const n = Number(body.superficie_declarada_ha)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: 'Superficie inválida' },
        { status: 400 },
      )
    }
    superficie = n
  }

  const update = {
    nombre: body.nombre?.trim() || null,
    comunidad: body.comunidad?.trim() || null,
    municipio: body.municipio?.trim() || null,
    superficie_declarada_ha: superficie,
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('parcelas')
    .update(update)
    .eq('id', params.id)
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Parcela no encontrada o sin acceso' },
      { status: 404 },
    )
  }

  return NextResponse.json({ ok: true })
}
