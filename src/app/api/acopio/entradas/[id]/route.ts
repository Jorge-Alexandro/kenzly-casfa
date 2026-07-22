// PATCH  /api/acopio/entradas/[id] — edita los datos de la boleta.
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

/** Campos de la boleta que se pueden corregir (no los totales: los suma el trigger). */
const EDITABLES = [
  'fecha_acopio', 'proveedor_nombre', 'comunidad', 'municipio',
  'cosecha', 'comentarios', 'elaborado_por_nombre',
] as const

const txt = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const supabase = await createClient()

  const { data: entrada, error: eErr } = await supabase
    .from('entradas')
    .select('id, folio, especie, tipo, estado')
    .eq('id', params.id)
    .maybeSingle()
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 })
  if (!entrada) return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 })

  // Una boleta ya cerrada (completada/cancelada) sólo la corrige un supervisor:
  // sus números ya se usaron para pagar y para el LPA.
  const cerrada = entrada.estado === 'completada' || entrada.estado === 'cancelada'
  if (cerrada && !esSupervisor(r.session.rol)) {
    return NextResponse.json(
      { error: 'La boleta está cerrada. Sólo un supervisor (admin/coordinador) puede corregirla.' },
      { status: 403 },
    )
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of EDITABLES) if (k in body) patch[k] = txt(body[k])
  if (!patch.proveedor_nombre && 'proveedor_nombre' in body) {
    return NextResponse.json({ error: 'El proveedor no puede quedar vacío' }, { status: 400 })
  }

  // Cambiar el producto cambia el factor de quintal: hay que RECALCULAR los
  // quintales de cada pesada, o los totales quedarían con el factor viejo.
  const especie = txt(body.especie) ?? entrada.especie
  const tipo = txt(body.tipo) ?? entrada.tipo
  const cambiaProducto = especie !== entrada.especie || tipo !== entrada.tipo

  if (cambiaProducto) {
    const { data: prod } = await supabase
      .from('acopio_producto')
      .select('factor_quintal')
      .eq('especie', especie)
      .eq('tipo', tipo)
      .maybeSingle()
    if (!prod) {
      return NextResponse.json({ error: `No existe el producto ${especie} ${tipo}` }, { status: 400 })
    }
    patch.especie = especie
    patch.tipo = tipo

    const factor = prod.factor_quintal as number | null
    const { data: pesadas } = await supabase
      .from('pesadas')
      .select('id, kg_netos')
      .eq('entrada_id', params.id)

    for (const p of pesadas ?? []) {
      const quintales = factor ? Math.round((Number(p.kg_netos) / factor) * 100) / 100 : null
      const { error } = await supabase.from('pesadas').update({ quintales }).eq('id', p.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  const { error } = await supabase.from('entradas').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, recalculado: cambiaProducto })
}

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

  // Si la borrada era la ÚLTIMA boleta, se devuelve el folio al contador: una
  // entrada de prueba creada y borrada no debe quemar un número. Si era una de
  // enmedio, el hueco se queda — esa boleta ya se entregó y el rastro importa.
  const { data: max } = await supabase
    .from('entradas')
    .select('folio')
    .order('folio', { ascending: false })
    .limit(1)
    .maybeSingle()

  const ultimo = (max?.folio as number | undefined) ?? 0
  let folioDevuelto = false
  if (ultimo < entrada.folio) {
    const { error: cErr } = await supabase
      .from('acopio_contador')
      .update({ ultimo_folio: ultimo })
      .eq('org_id', r.session.orgId)
    folioDevuelto = !cErr
  }

  return NextResponse.json({ ok: true, folio: entrada.folio, folioDevuelto })
}
