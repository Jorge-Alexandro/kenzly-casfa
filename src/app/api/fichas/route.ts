// POST /api/fichas — create a ficha with its selected parcelas and answers.
// Body: { tipo, template_id, productor_id, parcela_ids[], fecha_inspeccion,
//         respuestas: Record<nombre_interno, value>, estado }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

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

  return NextResponse.json({ ok: true, ficha_id: ficha.id })
}
