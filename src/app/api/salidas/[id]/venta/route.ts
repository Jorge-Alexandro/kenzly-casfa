// POST /api/salidas/[id]/venta — captura el PRECIO DE VENTA de una salida.
//
// Sólo Contabilidad (Iván). El importe = precio_kg × kg lo calcula el SERVIDOR
// con los kilos que ya trae la salida. La RLS de salida_venta es la barrera real:
// el operativo no puede ni leer esta tabla.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionResult } from '@/lib/session'

const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
const txt = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (r.session.rol !== 'admin' && r.session.rol !== 'contador') {
    return NextResponse.json(
      { error: 'Sólo Contabilidad puede capturar el precio de venta.' },
      { status: 403 },
    )
  }

  const b = await request.json().catch(() => null)
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const supabase = await createClient()

  const { data: salida, error: sErr } = await supabase
    .from('salida')
    .select('id, kg')
    .eq('id', params.id)
    .maybeSingle()
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 })
  if (!salida) return NextResponse.json({ error: 'Salida no encontrada' }, { status: 404 })

  const precio_kg = num(b.precio_kg)
  const kg = Number(salida.kg) || 0
  const importe = precio_kg == null ? null : Math.round(precio_kg * kg * 100) / 100

  const { error } = await supabase.from('salida_venta').upsert(
    {
      salida_id: params.id,
      org_id: r.session.orgId,
      precio_kg,
      importe,
      moneda: txt(b.moneda) ?? 'MXN',
      importe_cobrado: num(b.importe_cobrado) ?? 0,
      factura: txt(b.factura),
      observaciones: txt(b.observaciones),
      actualizado_por: r.session.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'salida_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, importe })
}
