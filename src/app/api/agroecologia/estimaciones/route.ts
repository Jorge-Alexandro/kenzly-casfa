// POST /api/agroecologia/estimaciones — registra una estimación de cosecha.
// El SERVIDOR calcula con estimacion.mjs (autoridad) usando la config de la org.
// Body café:  { parcela_id, ciclo, cultivo, metodo:'cafe', promedio_cerezo_bandola,
//               plantas_ha, superficie_ha?, valor_productor_kg?, valor_final_kg?, comentarios? }
// Body cacao: { parcela_id, ciclo, cultivo, metodo:'cacao', muestras[]|promedio_mazorcas,
//               n_arboles, superficie_ha?, valor_productor_kg?, valor_final_kg?, comentarios? }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { estimarCafe, estimarCacao } from '@/lib/agroecologia/estimacion.mjs'
import { getReglas } from '@/lib/data/estimacion'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const metodo = body.metodo
  if (metodo !== 'cafe' && metodo !== 'cacao') {
    return NextResponse.json({ error: 'Método inválido' }, { status: 400 })
  }
  if (!body.parcela_id || !body.ciclo || !body.cultivo) {
    return NextResponse.json({ error: 'Falta parcela, ciclo o cultivo' }, { status: 400 })
  }

  const supabase = await createClient()

  // Valida parcela (RLS por org) y toma productor + superficie del padrón.
  const { data: parcela, error: pErr } = await supabase
    .from('parcelas')
    .select('id, productor_id, superficie_declarada_ha')
    .eq('id', body.parcela_id)
    .maybeSingle()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 })
  if (!parcela) return NextResponse.json({ error: 'Parcela no encontrada' }, { status: 404 })

  const superficie_ha =
    body.superficie_ha != null ? Number(body.superficie_ha) : Number(parcela.superficie_declarada_ha) || null

  const reglas = await getReglas()

  const fila: Record<string, unknown> = {
    org_id: session.orgId,
    parcela_id: parcela.id,
    productor_id: parcela.productor_id,
    ciclo: String(body.ciclo),
    cultivo: String(body.cultivo),
    metodo,
    superficie_ha,
    inspector_id: session.userId,
    comentarios: body.comentarios ?? null,
    valor_productor_kg: body.valor_productor_kg != null ? Number(body.valor_productor_kg) : null,
  }

  if (metodo === 'cacao') {
    const r = estimarCacao(
      {
        muestras: Array.isArray(body.muestras) ? body.muestras : undefined,
        promedio_mazorcas: body.promedio_mazorcas,
        n_arboles: body.n_arboles,
      },
      { im: reglas.cacao.im },
    )
    fila.muestra = { muestras: body.muestras ?? null, promedio_mazorcas: body.promedio_mazorcas ?? null }
    fila.promedio = r.promedio_mazorcas
    fila.factor_o_im = reglas.cacao.im
    fila.n_arboles = Number(body.n_arboles) || null
    fila.kg_estimado = r.kg_seco
    fila.qq_estimado = null
    fila.tm = r.tm
    fila.rendimiento_kg_ha = superficie_ha ? round2(r.kg_seco / superficie_ha) : null
  } else {
    // café: convierte {hasta:null}→Infinity para el motor
    const factores = reglas.cafe.factores.map((f) => ({
      hasta: f.hasta == null ? Infinity : f.hasta,
      factor: f.factor,
    }))
    // kg por quintal según la base del cultivo (robusta cereza 80 / árabe pergamino 57.5).
    const kgPorQuintal =
      reglas.cafe.kg_por_quintal[String(body.cultivo)] ?? reglas.cafe.oro_kg
    const r = estimarCafe(
      {
        promedio_cerezo_bandola: body.promedio_cerezo_bandola,
        plantas_ha: body.plantas_ha,
        superficie_ha: superficie_ha ?? undefined,
      },
      { factores, constante: reglas.cafe.constante, kgPorQuintal },
    )
    fila.muestra = { promedio_cerezo_bandola: body.promedio_cerezo_bandola ?? null }
    fila.promedio = Number(body.promedio_cerezo_bandola) || 0
    fila.factor_o_im = r.factor
    fila.plantas_ha = Number(body.plantas_ha) || null
    fila.kg_estimado = r.kg ?? null                 // kg en la base del cultivo
    fila.qq_estimado = r.qq ?? r.qq_ha              // quintales (invariante)
    fila.tm = r.tm ?? null
    fila.rendimiento_kg_ha =
      superficie_ha && r.kg ? round2(r.kg / superficie_ha) : null
  }

  // Valor final: lo negociado; si no se envía, arranca en el calculado.
  fila.valor_final_kg =
    body.valor_final_kg != null ? Number(body.valor_final_kg) : (fila.kg_estimado ?? null)

  const { data: est, error: eErr } = await supabase
    .from('estimacion_cosecha')
    .insert(fila)
    .select('id')
    .single()
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 })

  return NextResponse.json({ ok: true, id: est.id })
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
