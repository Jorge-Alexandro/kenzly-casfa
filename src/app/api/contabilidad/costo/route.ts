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

  // Kilos pagables. Para las boletas normales es todo el neto; para las de la
  // cooperativa FLO (Chula Vista) es sólo el excedente sobre la estimación, o
  // el ajuste manual si Contabilidad lo fija (kg_pagable), acotado a [0, neto].
  const esCoop = esCooperativa(entrada.comunidad as string | null)
  let kg_pagable: number | null = null // lo que se guarda como ajuste manual
  let baseKg = kgNetos
  if (esCoop) {
    // ¿Vino kg_pagable en el body? Si no, se PRESERVA el que ya tenía la boleta
    // (reguardar sólo el precio no debe borrar un ajuste manual previo).
    const mandaPagable = !!b && Object.prototype.hasOwnProperty.call(b, 'kg_pagable')
    const { data: prev } = await supabase
      .from('entrada_costo')
      .select('kg_pagable')
      .eq('entrada_id', entrada_id)
      .maybeSingle()
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
  }
  const importe = precio_kg == null ? null : Math.round(precio_kg * baseKg * 100) / 100

  // OJO: aquí NO se tocan `importe_pagado` ni `factura`. El total pagado lo
  // mantiene el trigger sumando los abonos (entrada_pago) y las facturas viven
  // en entrada_factura; escribirlos aquí borraría el detalle de Vicky.
  const fila = {
    entrada_id,
    org_id: r.session.orgId,
    precio_kg,
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

  return NextResponse.json({ ok: true, importe, base_kg: baseKg, kg_pagable })
}
