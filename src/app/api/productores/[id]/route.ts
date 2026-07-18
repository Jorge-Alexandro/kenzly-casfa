// PATCH /api/productores/[id] — edit a productor's catalog fields.
// Only admin/coordinador may edit catalogs (inspectors capture, not curate).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import type { ProductorEdit } from '@/lib/types'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  // El SIC corrige datos del productor en campo (todos los roles), como el alta.

  const body = (await request.json().catch(() => null)) as ProductorEdit | null
  if (!body) {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  if (!body.nombre_completo?.trim()) {
    return NextResponse.json(
      { error: 'El nombre del productor es obligatorio' },
      { status: 400 },
    )
  }

  // Whitelist editable fields — never trust the client to set org_id/codigo/id.
  const update = {
    nombre_completo: body.nombre_completo.trim(),
    comunidad: body.comunidad?.trim() || null,
    municipio: body.municipio?.trim() || null,
    sexo: body.sexo?.trim() || null,
    anio_ingreso: body.anio_ingreso ?? null,
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('productores')
    .update(update)
    .eq('id', params.id)
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Productor no encontrado o sin acceso' },
      { status: 404 },
    )
  }

  return NextResponse.json({ ok: true })
}
