// POST /api/bitacora — create or update a bitácora.
// Body: { parcela_id, anio, datos, ficha_id? }
//   - con ficha_id: una bitácora por ficha (anexo de inspección)
//   - sin ficha_id: una bitácora suelta por (parcela_id, año)
// Hacemos select-then-insert/update manual para no depender de ON CONFLICT con
// índices parciales.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  const { parcela_id, anio, datos, ficha_id } = body
  if (typeof parcela_id !== 'string' || !parcela_id) {
    return NextResponse.json({ error: 'Falta la parcela' }, { status: 400 })
  }
  const year = Number(anio)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Año inválido' }, { status: 400 })
  }
  const fichaId = typeof ficha_id === 'string' && ficha_id ? ficha_id : null

  const supabase = await createClient()

  // Validate the parcela belongs to this org.
  const { data: parcela, error: paErr } = await supabase
    .from('parcelas')
    .select('id')
    .eq('id', parcela_id)
    .maybeSingle()
  if (paErr) return NextResponse.json({ error: paErr.message }, { status: 400 })
  if (!parcela) {
    return NextResponse.json({ error: 'Parcela no encontrada' }, { status: 404 })
  }

  // Find an existing record by the appropriate key.
  let existingId: string | null = null
  if (fichaId) {
    const { data } = await supabase
      .from('bitacora_anual')
      .select('id')
      .eq('ficha_id', fichaId)
      .maybeSingle()
    existingId = data?.id ?? null
  } else {
    const { data } = await supabase
      .from('bitacora_anual')
      .select('id')
      .eq('parcela_id', parcela_id)
      .eq('anio', year)
      .is('ficha_id', null)
      .maybeSingle()
    existingId = data?.id ?? null
  }

  const payload = {
    org_id: session.orgId,
    parcela_id,
    anio: year,
    ficha_id: fichaId,
    datos: datos ?? {},
    updated_at: new Date().toISOString(),
  }

  if (existingId) {
    const { error } = await supabase
      .from('bitacora_anual')
      .update(payload)
      .eq('id', existingId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: existingId })
  }

  const { data, error } = await supabase
    .from('bitacora_anual')
    .insert(payload)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: data.id })
}
