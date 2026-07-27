// POST /api/contabilidad/costo — guarda el costo de una boleta (Contabilidad).
// Body: { entrada_id, precio_kg?, kg_pagable?, observaciones? }
//
// El SERVIDOR calcula el importe = precio_kg × kg pagables (no confía en un
// importe del cliente). Para las boletas de la cooperativa FLO (Chula Vista)
// los kg pagables son sólo el EXCEDENTE sobre la estimación (reparto de
// getAsignacionCoop), o el ajuste manual kg_pagable si Contabilidad lo fija.
// La RLS de entrada_costo bloquea a cualquiera que no sea admin/contador.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionResult } from '@/lib/session'
import { esCooperativa } from '@/lib/contabilidad/almacenes'
import { getAsignacionCoop } from '@/lib/data/almacenes'

const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
const txt = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

export async function POST(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  // La RLS es la barrera real; esto sólo da un mensaje claro.
  if (r.session.rol !== 'admin' && r.session.rol !== 'contador') {
    return NextResponse.json({ error: 'Sólo Contabilidad puede capturar costos.' }, { status: 403 })
  }

  const b = await request.json().catch(() => null)
  const entrada_id = txt(b?.entrada_id)
  if (!entrada_id) return NextResponse.json({ error: 'Falta la entrada' }, { status: 400 })

  const supabase = await createClient()

  const { data: entrada, error: eErr } = await supabase
    .from('entradas')
    .select('id, kg_netos, comunidad')
    .eq('id', entrada_id)
    .maybeSingle()
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 })
  if (!entrada) return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 })

  const precio_kg = num(b?.precio_kg)
  const kgNetos = Number(entrada.kg_netos) || 0
  const esCoop = esCooperativa(entrada.comunidad as string | null)

  // Los ajustes por boleta (kg_pagable y precio de la cooperativa) se PRESERVAN
  // si no vienen en el body: reguardar sólo el precio del excedente no debe
  // borrar un ajuste previo, ni al revés.
  const { data: prev } = esCoop
    ? await supabase
        .from('entrada_costo')
        .select('kg_pagable, precio_kg_coop')
        .eq('entrada_id', entrada_id)
        .maybeSingle()
    : { data: null }

  // Kilos del excedente (CASFASA) sobre los que se paga a precio_kg. Para las
  // boletas normales es todo el neto; para las de la cooperativa FLO es sólo el
  // excedente sobre la estimación, o el ajuste manual (kg_pagable) en [0, neto].
  let kg_pagable: number | null = null
  let baseKg = kgNetos
  let precio_kg_coop: number | null = null
  if (esCoop) {
    const mandaPagable = !!b && Object.prototype.hasOwnProperty.call(b, 'kg_pagable')
    const manual = mandaPagable
      ? num(b?.kg_pagable)
      : prev?.kg_pagable == null
        ? null
        : Number(prev.kg_pagable)

    if (manual != null) {
      kg_pagable = Math.max(0, Math.min(kgNetos, manual))
      baseKg = kg_pagable
    } else {
      const asignacion = await getAsignacionCoop(supabase)
      baseKg = asignacion.get(entrada_id)?.kg_casfasa ?? kgNetos
    }

    // Precio de la parte de la cooperativa (FLO). Se preserva si no vino.
    const mandaCoop = !!b && Object.prototype.hasOwnProperty.call(b, 'precio_kg_coop')
    precio_kg_coop = mandaCoop
      ? num(b?.precio_kg_coop)
      : prev?.precio_kg_coop == null
        ? null
        : Number(prev.precio_kg_coop)
  }

  // Importe = excedente (CASFASA) a precio_kg + parte cooperativa (FLO) a
  // precio_kg_coop. En boletas normales sólo cuenta precio_kg × kg_netos.
  const coopKg = Math.round((kgNetos - baseKg) * 1000) / 1000
  const parteCasfasa = precio_kg == null ? null : precio_kg * baseKg
  const parteCoop = esCoop && precio_kg_coop != null ? precio_kg_coop * coopKg : 0
  const importe =
    parteCasfasa == null && parteCoop === 0
      ? null
      : Math.round(((parteCasfasa ?? 0) + parteCoop) * 100) / 100

  // OJO: aquí NO se tocan `importe_pagado` ni `factura`. El total pagado lo
  // mantiene el trigger sumando los abonos (entrada_pago) y las facturas viven
  // en entrada_factura; escribirlos aquí borraría el detalle de Vicky.
  const fila = {
    entrada_id,
    org_id: r.session.orgId,
    precio_kg,
    precio_kg_coop,
    importe,
    kg_pagable,
    observaciones: txt(b?.observaciones),
    actualizado_por: r.session.userId,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('entrada_costo')
    .upsert(fila, { onConflict: 'entrada_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, importe, base_kg: baseKg, kg_pagable, precio_kg_coop })
}
