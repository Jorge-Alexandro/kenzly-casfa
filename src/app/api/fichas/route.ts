// POST /api/fichas — create a ficha with its selected parcelas and answers.
// Body: { tipo, template_id, productor_id, parcela_ids[], fecha_inspeccion,
//         respuestas: Record<nombre_interno, value>, estado }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { estimarCafe, estimarCacao, CACAO_IM_DEFAULT } from '@/lib/agroecologia/estimacion.mjs'

// Temporada estilo "2025-2026" desde la fecha (corte en septiembre).
function temporadaDe(fecha: string | null): string {
  const d = fecha ? new Date(fecha) : new Date()
  const y = d.getFullYear()
  return d.getMonth() + 1 >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

const TIPOS = ['robusta', 'arabe', 'tropicales']
const ESTADOS_PERMITIDOS = ['borrador', 'en_revision']

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const { tipo, template_id, productor_id, parcela_ids, fecha_inspeccion, respuestas, estado } =
    body

  if (!TIPOS.includes(tipo)) {
    return NextResponse.json({ error: 'Tipo de ficha inválido' }, { status: 400 })
  }
  if (typeof productor_id !== 'string' || !productor_id) {
    return NextResponse.json({ error: 'Falta el productor' }, { status: 400 })
  }
  if (!Array.isArray(parcela_ids) || parcela_ids.length === 0) {
    return NextResponse.json(
      { error: 'Selecciona al menos una parcela' },
      { status: 400 },
    )
  }
  const estadoFinal = ESTADOS_PERMITIDOS.includes(estado) ? estado : 'borrador'

  const supabase = await createClient()

  // Recompute area from the DB — never trust a client-sent total. Also validates
  // (via RLS + productor filter) that the parcelas belong to this productor/org.
  const { data: parcelas, error: paErr } = await supabase
    .from('parcelas')
    .select('id, superficie_declarada_ha')
    .eq('productor_id', productor_id)
    .in('id', parcela_ids)

  if (paErr) {
    return NextResponse.json({ error: paErr.message }, { status: 400 })
  }
  if (!parcelas || parcelas.length !== parcela_ids.length) {
    return NextResponse.json(
      { error: 'Alguna parcela no pertenece al productor seleccionado' },
      { status: 400 },
    )
  }
  const areaCultivada = parcelas.reduce(
    (s, p) => s + (Number(p.superficie_declarada_ha) || 0),
    0,
  )

  // Mirror the canonical evaluation field for queryability; the full set of
  // answers lives in respuestas (JSONB keyed by nombre_interno).
  const respuestasObj =
    respuestas && typeof respuestas === 'object' ? respuestas : {}
  const resultado = respuestasObj['resultado_evaluacion'] ?? null

  const { data: ficha, error: fErr } = await supabase
    .from('fichas')
    .insert({
      org_id: session.orgId,
      template_id: template_id ?? null,
      tipo,
      productor_id,
      inspector_id: session.userId,
      fecha_inspeccion: fecha_inspeccion || null,
      area_cultivada_ha: areaCultivada,
      resultado_evaluacion: resultado,
      estado: estadoFinal,
      respuestas: respuestasObj,
    })
    .select('id')
    .single()

  if (fErr) {
    return NextResponse.json({ error: fErr.message }, { status: 400 })
  }

  // Detail rows: one per selected parcela.
  const detalle = parcela_ids.map((pid: string) => ({
    org_id: session.orgId,
    ficha_id: ficha.id,
    parcela_id: pid,
  }))
  const { error: dErr } = await supabase.from('ficha_parcelas').insert(detalle)
  if (dErr) {
    // The ficha was created but detail failed — surface it explicitly.
    return NextResponse.json(
      { error: `Ficha creada pero falló el detalle: ${dErr.message}`, ficha_id: ficha.id },
      { status: 500 },
    )
  }

  // Fuente única: si la ficha capturó estimación de cosecha, escribirla también
  // en estimacion_cosecha (la fuente del LPA). El servidor RECALCULA con el motor
  // — no confía en el kg del cliente. Se aplica a la 1ª parcela de la ficha.
  const estMetodo = respuestasObj['est_metodo'] as string | undefined
  const estPromedio = Number(respuestasObj['est_promedio']) || 0
  if (estMetodo && estPromedio > 0) {
    const esCacao = estMetodo === 'Cacao'
    const pa = Number(respuestasObj['est_plantas_arboles']) || 0
    const superficie = Number(respuestasObj['est_superficie_ha']) || null
    let factor_im: number, kg: number | null, qq: number | null
    if (esCacao) {
      const r = estimarCacao({ promedio_mazorcas: estPromedio, n_arboles: pa }, {})
      factor_im = CACAO_IM_DEFAULT; kg = r.kg_seco; qq = null
    } else {
      const r = estimarCafe(
        { promedio_cerezo_bandola: estPromedio, plantas_ha: pa, superficie_ha: superficie ?? undefined },
        { kgPorQuintal: tipo === 'arabe' ? 57.5 : 80 },
      )
      factor_im = r.factor; kg = r.kg ?? null; qq = r.qq ?? r.qq_ha ?? null
    }
    const cultivo = esCacao ? 'cacao' : tipo === 'arabe' ? 'cafe_arabe' : 'cafe_robusta'
    const { error: eErr } = await supabase.from('estimacion_cosecha').upsert(
      {
        org_id: session.orgId,
        parcela_id: parcela_ids[0],
        productor_id,
        ciclo: temporadaDe(fecha_inspeccion),
        cultivo,
        metodo: esCacao ? 'cacao' : 'cafe',
        muestra: { origen: 'ficha', ficha_id: ficha.id, promedio: estPromedio, plantas_arboles: pa },
        promedio: estPromedio,
        factor_o_im: factor_im,
        plantas_ha: esCacao ? null : pa,
        n_arboles: esCacao ? pa : null,
        superficie_ha: superficie,
        kg_estimado: kg,
        qq_estimado: qq,
        rendimiento_kg_ha: kg && superficie ? Math.round((kg / superficie) * 100) / 100 : null,
        valor_final_kg: kg,
        inspector_id: session.userId,
        fecha: fecha_inspeccion || null,
      },
      { onConflict: 'parcela_id,ciclo,cultivo' },
    )
    // Best-effort: no bloquea la ficha si falla.
    if (eErr) console.error('[fichas] estimacion_cosecha upsert:', eErr.message)
  }

  return NextResponse.json({ ok: true, ficha_id: ficha.id })
}
