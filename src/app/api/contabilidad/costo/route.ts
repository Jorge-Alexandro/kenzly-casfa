// POST /api/contabilidad/costo — guarda el costo de una boleta (Contabilidad).
// Body: { entrada_id, precio_kg?, importe_pagado?, factura? }
//
// El SERVIDOR calcula el importe = precio_kg × kg_netos con los kilos que ya
// trae la entrada (no confía en un importe del cliente). La RLS de entrada_costo
// bloquea a cualquiera que no sea admin/contador.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionResult } from '@/lib/session'

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
    .select('id, kg_netos')
    .eq('id', entrada_id)
    .maybeSingle()
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 })
  if (!entrada) return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 })

  const precio_kg = num(b?.precio_kg)
  const kgNetos = Number(entrada.kg_netos) || 0
  const importe = precio_kg == null ? null : Math.round(precio_kg * kgNetos * 100) / 100

  const fila = {
    entrada_id,
    org_id: r.session.orgId,
    precio_kg,
    importe,
    importe_pagado: num(b?.importe_pagado) ?? 0,
    factura: txt(b?.factura),
    observaciones: txt(b?.observaciones),
    actualizado_por: r.session.userId,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('entrada_costo')
    .upsert(fila, { onConflict: 'entrada_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, importe })
}
