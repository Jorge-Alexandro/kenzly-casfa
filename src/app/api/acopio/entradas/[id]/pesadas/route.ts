// POST /api/acopio/entradas/[id]/pesadas — agrega una pesada a la entrada.
// El SERVIDOR es la autoridad del cálculo: recalcula tara/netos/quintales con
// calculo.mjs usando la config de la org (nunca confía en los derivados del
// cliente). El nº de pesada y los totales de la entrada los ponen los triggers.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { calcularPesada, validarPesada } from '@/lib/acopio/calculo.mjs'

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const supabase = await createClient()

  const { data: entrada, error: eErr } = await supabase
    .from('entradas')
    .select('id, especie, tipo, estado')
    .eq('id', params.id)
    .maybeSingle()
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 })
  if (!entrada) return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 })
  if (entrada.estado === 'cancelada' || entrada.estado === 'completada') {
    return NextResponse.json(
      { error: 'La entrada ya no admite pesadas' },
      { status: 409 },
    )
  }

  // Config de la org: factor de quintal del tipo + tara por material.
  const { data: prod } = await supabase
    .from('acopio_producto')
    .select('factor_quintal')
    .eq('especie', entrada.especie)
    .eq('tipo', entrada.tipo)
    .maybeSingle()
  const { data: taraRows } = await supabase
    .from('acopio_tara')
    .select('material, kg_por_unidad')
  const tara: Record<string, number> = {}
  for (const r of taraRows ?? []) tara[r.material] = Number(r.kg_por_unidad)

  const cfg = { tara, factorQuintal: prod?.factor_quintal ?? null }

  const captura = {
    m1_sacos: Number(body.m1_sacos) || 0,
    m1_kgs: Number(body.m1_kgs) || 0,
    m2_sacos: Number(body.m2_sacos) || 0,
    m2_kgs: Number(body.m2_kgs) || 0,
    plastico: Number(body.plastico) || 0,
    yute: Number(body.yute) || 0,
    henequen: Number(body.henequen) || 0,
  }

  const val = validarPesada(captura, cfg)
  if (!val.ok) {
    return NextResponse.json({ error: val.errores.join(' ') }, { status: 400 })
  }
  const d = calcularPesada(captura, cfg)

  const { data: pesada, error: pErr } = await supabase
    .from('pesadas')
    .insert({
      org_id: session.orgId,
      entrada_id: entrada.id,
      // numero_pesada: null → lo asigna el trigger (max+1 por entrada)
      ...captura,
      sacos_total: d.sacos_total,
      kg_brutos: d.kg_brutos,
      tara_kg: d.tara_kg,
      kg_netos: d.kg_netos,
      quintales: d.quintales,
    })
    .select('id, numero_pesada')
    .single()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 })

  return NextResponse.json({ ok: true, id: pesada.id, numero_pesada: pesada.numero_pesada })
}
