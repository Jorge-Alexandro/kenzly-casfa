// DELETE /api/acopio/entradas/[id] — borra una entrada y, en cascada, sus
// pesadas (FK on delete cascade) y sus evidencias en Storage.
//
// Borrar es irreversible y se lleva la boleta completa, así que sólo lo puede
// hacer un supervisor (admin/coordinador). Un capturista que se equivocó tiene
// el camino de CANCELAR la entrada, que conserva el rastro.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionResult } from '@/lib/session'
import { esSupervisor } from '@/lib/acopio/estado'

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!esSupervisor(r.session.rol)) {
    return NextResponse.json(
      { error: 'Sólo un supervisor (admin/coordinador) puede borrar una entrada. Puedes cancelarla.' },
      { status: 403 },
    )
  }

  const supabase = await createClient()

  const { data: entrada, error: eErr } = await supabase
    .from('entradas')
    .select('id, folio')
    .eq('id', params.id)
    .maybeSingle()
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 })
  if (!entrada) return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 })

  // Evidencias en Storage: sin esto quedarían huérfanas ocupando espacio.
  // Si falla, no abortamos el borrado — el archivo suelto es menos grave que
  // dejar la entrada a medio borrar.
  const { data: archivos } = await supabase.storage.from('geosic').list(`acopio/${params.id}`)
  if (archivos?.length) {
    await supabase.storage
      .from('geosic')
      .remove(archivos.map((a) => `acopio/${params.id}/${a.name}`))
  }

  // Las pesadas se van solas (on delete cascade).
  const { error } = await supabase.from('entradas').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // OJO: el folio NO se recicla. El contador sigue avanzando, así que el número
  // borrado queda como hueco — igual que una boleta de papel que se rompe.
  return NextResponse.json({ ok: true, folio: entrada.folio })
}
