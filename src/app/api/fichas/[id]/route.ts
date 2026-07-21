// PATCH /api/fichas/[id] — reabrir y editar una ficha ya guardada.
// Body: { productor_id?, parcela_ids[], fecha_inspeccion, respuestas, estado? }
//
// Una ficha aprobada o con PDF generado ya salió del circuito interno: solo
// admin/coordinador pueden reeditarla, y solo después de regresarla a revisión.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import {
  ESTADOS_PERMITIDOS,
  validarParcelas,
  sincronizarEstimacion,
} from '@/lib/fichas/guardar'

const CERRADOS = ['aprobada', 'pdf_generado']
const PUEDEN_REABRIR = ['admin', 'coordinador']

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (session.rol === 'solo_lectura') {
    return NextResponse.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const { parcela_ids, fecha_inspeccion, respuestas, estado } = body
  if (!Array.isArray(parcela_ids) || parcela_ids.length === 0) {
    return NextResponse.json({ error: 'Selecciona al menos una parcela' }, { status: 400 })
  }

  const supabase = await createClient()

  const { data: actual, error: fErr } = await supabase
    .from('fichas')
    .select('id, tipo, estado, productor_id, inspector_id')
    .eq('id', params.id)
    .maybeSingle()
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 400 })
  if (!actual) return NextResponse.json({ error: 'Ficha no encontrada' }, { status: 404 })

  if (CERRADOS.includes(actual.estado) && !PUEDEN_REABRIR.includes(session.rol)) {
    return NextResponse.json(
      { error: 'Esta ficha ya fue aprobada. Pide al coordinador que la regrese a revisión.' },
      { status: 403 },
    )
  }

  // El productor no se cambia al editar: cambiarlo dejaría la ficha con
  // parcelas de otra persona. Si se equivocaron de productor, se hace una nueva.
  const productorId = actual.productor_id as string
  const val = await validarParcelas(supabase, productorId, parcela_ids)
  if ('error' in val) return NextResponse.json({ error: val.error }, { status: 400 })

  const respuestasObj = respuestas && typeof respuestas === 'object' ? respuestas : {}

  const patch: Record<string, unknown> = {
    fecha_inspeccion: fecha_inspeccion || null,
    area_cultivada_ha: val.areaHa,
    resultado_evaluacion: respuestasObj['resultado_evaluacion'] ?? null,
    respuestas: respuestasObj,
    updated_at: new Date().toISOString(),
  }
  // Reabrir una ficha cerrada la regresa a revisión; si no, solo se acepta un
  // estado de captura (borrador/en_revision).
  if (CERRADOS.includes(actual.estado)) patch.estado = 'en_revision'
  else if (ESTADOS_PERMITIDOS.includes(estado)) patch.estado = estado

  const { error: uErr } = await supabase.from('fichas').update(patch).eq('id', params.id)
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 })

  // Sincronizar el detalle de parcelas por diferencia (pueden haber quitado o
  // agregado una). Se toca solo lo que cambió: borrar todo y reinsertar dejaría
  // la ficha sin parcelas si el insert fallara.
  const { data: yaHay } = await supabase
    .from('ficha_parcelas')
    .select('parcela_id')
    .eq('ficha_id', params.id)
  const existentes = (yaHay ?? []).map((r) => r.parcela_id as string)
  const sobran = existentes.filter((pid) => !parcela_ids.includes(pid))
  if (sobran.length > 0) {
    const { error: dErr } = await supabase
      .from('ficha_parcelas')
      .delete()
      .eq('ficha_id', params.id)
      .in('parcela_id', sobran)
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 })
  }

  const faltantes = parcela_ids.filter((pid: string) => !existentes.includes(pid))
  if (faltantes.length > 0) {
    const { error: iErr } = await supabase.from('ficha_parcelas').insert(
      faltantes.map((pid: string) => ({
        org_id: session.orgId,
        ficha_id: params.id,
        parcela_id: pid,
      })),
    )
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 })
  }

  await sincronizarEstimacion(supabase, {
    orgId: session.orgId,
    fichaId: params.id,
    tipo: actual.tipo as string,
    productorId,
    parcelaIds: parcela_ids,
    fechaInspeccion: fecha_inspeccion || null,
    respuestas: respuestasObj,
    userId: session.userId,
  })

  return NextResponse.json({ ok: true, ficha_id: params.id })
}
