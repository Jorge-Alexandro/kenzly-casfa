// POST /api/salidas — registra una salida física del almacén.
// La captura el OPERATIVO: aquí no se toca dinero (el precio de venta va por
// /api/salidas/[id]/venta y sólo lo puede Contabilidad). El folio lo pone el
// trigger; los quintales se derivan del factor del producto si aplica.
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

  const b = await request.json().catch(() => null)
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const cliente = txt(b.cliente)
  if (!cliente) return NextResponse.json({ error: 'Falta el cliente o destinatario' }, { status: 400 })

  const kg = num(b.kg) ?? 0
  const sacos = num(b.sacos) ?? 0
  if (kg <= 0 && sacos <= 0) {
    return NextResponse.json({ error: 'Captura la cantidad (sacos o kilos)' }, { status: 400 })
  }

  const supabase = await createClient()

  // Quintales con el factor del producto (misma autoridad que acopio).
  const especie = txt(b.especie)
  const tipo = txt(b.tipo)
  let quintales = num(b.quintales)
  if (quintales == null && especie && tipo && kg > 0) {
    const { data: prod } = await supabase
      .from('acopio_producto')
      .select('factor_quintal')
      .eq('especie', especie)
      .eq('tipo', tipo)
      .maybeSingle()
    const factor = prod?.factor_quintal as number | null
    if (factor && factor > 0) quintales = Math.round((kg / factor) * 1000) / 1000
  }

  const { data, error } = await supabase
    .from('salida')
    .insert({
      org_id: r.session.orgId,
      fecha: txt(b.fecha) ?? new Date().toISOString().slice(0, 10),
      guia: txt(b.guia),
      cliente,
      destino: txt(b.destino),
      especie,
      tipo,
      producto_texto: txt(b.producto_texto),
      sacos,
      kg,
      quintales,
      responsable: txt(b.responsable),
      transporte: txt(b.transporte),
      placas: txt(b.placas),
      observaciones: txt(b.observaciones),
      estado: b.estado === 'entregada' ? 'entregada' : 'programada',
      creado_por: r.session.userId,
    })
    .select('id, folio')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, id: data.id, folio: data.folio })
}
