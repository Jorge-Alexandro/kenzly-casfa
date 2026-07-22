// PATCH  /api/acopio/pesadas/[id] — corrige una pesada ya capturada.
// DELETE /api/acopio/pesadas/[id] — borra una pesada.
// En ambos casos el trigger recalcula los totales de su entrada.
//
// El SERVIDOR es la autoridad del cálculo: recalcula tara/netos/quintales con
// calculo.mjs y la config de la org; nunca confía en los derivados del cliente
// (mismo criterio que al agregar una pesada).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionResult } from '@/lib/session'
import { esSupervisor } from '@/lib/acopio/estado'
import { calcularPesada, validarPesada } from '@/lib/acopio/calculo.mjs'

const CAMPOS = ['m1_sacos', 'm1_kgs', 'm2_sacos', 'm2_kgs', 'plastico', 'yute', 'henequen'] as const

/** Una boleta cerrada se puede corregir, pero sólo por un supervisor: sus kilos
 *  ya se usaron para pagar al productor y para el LPA. */
async function bloqueadaPorCierre(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entradaId: string,
  rol: Parameters<typeof esSupervisor>[0],
): Promise<boolean> {
  const { data: entrada } = await supabase
    .from('entradas')
    .select('estado')
    .eq('id', entradaId)
    .maybeSingle()
  const cerrada = entrada?.estado === 'completada' || entrada?.estado === 'cancelada'
  return cerrada && !esSupervisor(rol)
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const supabase = await createClient()

  const { data: pesada, error: pErr } = await supabase
    .from('pesadas')
    .select('id, entrada_id, numero_pesada')
    .eq('id', params.id)
    .maybeSingle()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 })
  if (!pesada) return NextResponse.json({ error: 'Pesada no encontrada' }, { status: 404 })

  if (await bloqueadaPorCierre(supabase, pesada.entrada_id, r.session.rol)) {
    return NextResponse.json(
      { error: 'La boleta está cerrada. Sólo un supervisor (admin/coordinador) puede corregir sus pesadas.' },
      { status: 403 },
    )
  }

  const { data: entrada } = await supabase
    .from('entradas')
    .select('especie, tipo')
    .eq('id', pesada.entrada_id)
    .maybeSingle()
  if (!entrada) return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 })

  // Config de la org: factor de quintal del producto + tara por material.
  const { data: prod } = await supabase
    .from('acopio_producto')
    .select('factor_quintal')
    .eq('especie', entrada.especie)
    .eq('tipo', entrada.tipo)
    .maybeSingle()
  const { data: taraRows } = await supabase.from('acopio_tara').select('material, kg_por_unidad')
  const tara: Record<string, number> = {}
  for (const t of taraRows ?? []) tara[t.material] = Number(t.kg_por_unidad)

  const captura = Object.fromEntries(CAMPOS.map((k) => [k, Number(body[k]) || 0])) as Record<
    (typeof CAMPOS)[number],
    number
  >

  const cfg = { tara, factorQuintal: prod?.factor_quintal ?? null }
  const val = validarPesada(captura, cfg)
  if (!val.ok) {
    return NextResponse.json({ error: val.errores.join(' ') }, { status: 400 })
  }

  const calc = calcularPesada(captura, cfg)

  const { error } = await supabase
    .from('pesadas')
    .update({
      ...captura,
      sacos_total: calc.sacos_total,
      kg_brutos: calc.kg_brutos,
      tara_kg: calc.tara_kg,
      kg_netos: calc.kg_netos,
      quintales: calc.quintales,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, numero_pesada: pesada.numero_pesada, ...calc })
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = await createClient()

  const { data: pesada } = await supabase
    .from('pesadas')
    .select('entrada_id')
    .eq('id', params.id)
    .maybeSingle()
  if (pesada && (await bloqueadaPorCierre(supabase, pesada.entrada_id, r.session.rol))) {
    return NextResponse.json(
      { error: 'La boleta está cerrada. Sólo un supervisor puede borrar sus pesadas.' },
      { status: 403 },
    )
  }

  const { error } = await supabase.from('pesadas').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
