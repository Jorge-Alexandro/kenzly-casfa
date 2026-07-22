// DELETE /api/contratos/[id] — borra un contrato y sus firmas en Storage.
//
// Borrar es irreversible. Sólo un supervisor (admin/coordinador) puede hacerlo,
// igual que en acopio. Si el borrado deja el contador de folios por encima del
// máximo real (se borró el último), se devuelve el folio para no dejar huecos.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionResult } from '@/lib/session'
import { esSupervisor } from '@/lib/acopio/estado'

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!esSupervisor(r.session.rol)) {
    return NextResponse.json(
      { error: 'Sólo un supervisor (admin/coordinador) puede borrar un contrato.' },
      { status: 403 },
    )
  }

  const supabase = await createClient()

  const { data: contrato, error: cErr } = await supabase
    .from('contrato_fijacion')
    .select('id, folio')
    .eq('id', params.id)
    .maybeSingle()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 })
  if (!contrato) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })

  // Firmas en Storage (si las hay). No abortamos si falla: un archivo suelto es
  // menos grave que dejar el contrato a medio borrar.
  const { data: archivos } = await supabase.storage.from('geosic').list(`contratos/${params.id}`)
  if (archivos?.length) {
    await supabase.storage
      .from('geosic')
      .remove(archivos.map((a) => `contratos/${params.id}/${a.name}`))
  }

  const { error } = await supabase.from('contrato_fijacion').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Devolver el folio si era el último (una prueba borrada no debe quemar número).
  const { data: max } = await supabase
    .from('contrato_fijacion')
    .select('folio')
    .order('folio', { ascending: false })
    .limit(1)
    .maybeSingle()
  const ultimo = (max?.folio as number | undefined) ?? 0
  if (ultimo < contrato.folio) {
    await supabase.from('contrato_contador').update({ ultimo_folio: ultimo }).eq('org_id', r.session.orgId)
  }

  return NextResponse.json({ ok: true, folio: contrato.folio })
}
