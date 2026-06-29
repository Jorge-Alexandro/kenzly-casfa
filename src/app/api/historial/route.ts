// POST /api/historial — guarda el historial completo de una parcela.
// Body: { parcela_id, anios: [{ anio, datos }] }
// Upsert por (parcela_id, año); elimina los años que ya no estén en la lista.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parcelaId = body?.parcela_id
  const anios = body?.anios
  if (typeof parcelaId !== 'string' || !parcelaId) {
    return NextResponse.json({ error: 'Falta la parcela' }, { status: 400 })
  }
  if (!Array.isArray(anios)) {
    return NextResponse.json({ error: 'anios inválido' }, { status: 400 })
  }

  const supabase = await createClient()

  // Validar parcela (org).
  const { data: parcela, error: paErr } = await supabase
    .from('parcelas')
    .select('id')
    .eq('id', parcelaId)
    .maybeSingle()
  if (paErr) return NextResponse.json({ error: paErr.message }, { status: 400 })
  if (!parcela) {
    return NextResponse.json({ error: 'Parcela no encontrada' }, { status: 404 })
  }

  // Normalizar/validar años.
  const limpios = anios
    .map((a: { anio: unknown; datos: unknown }) => ({
      anio: Number(a.anio),
      datos: a.datos && typeof a.datos === 'object' ? a.datos : {},
    }))
    .filter((a) => Number.isInteger(a.anio) && a.anio >= 2000 && a.anio <= 2100)

  // Upsert de cada año (la tabla tiene unique(parcela_id, anio)).
  if (limpios.length > 0) {
    const filas = limpios.map((a) => ({
      org_id: session.orgId,
      parcela_id: parcelaId,
      anio: a.anio,
      datos: a.datos,
    }))
    const { error } = await supabase
      .from('historial_manejo_anual')
      .upsert(filas, { onConflict: 'parcela_id,anio' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Borrar años removidos (los que están en BD pero no en la lista enviada).
  const conservar = limpios.map((a) => a.anio)
  let del = supabase
    .from('historial_manejo_anual')
    .delete()
    .eq('parcela_id', parcelaId)
  if (conservar.length > 0) {
    del = del.not('anio', 'in', `(${conservar.join(',')})`)
  }
  const { error: delErr } = await del
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
