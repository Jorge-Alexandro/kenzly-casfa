// POST /api/contratos — crea un contrato de fijación.
// El SERVIDOR es la autoridad: toma las cláusulas de la plantilla del producto y
// del config del comprador y las CONGELA en el contrato (snapshot), para que un
// cambio futuro de la plantilla no altere un contrato ya emitido. El folio lo
// asigna el trigger. El importe lo calcula la columna generada en la BD.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionResult } from '@/lib/session'
import type { ArbitrajeTipo } from '@/lib/contratos/tipos'

const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
const txt = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

export async function POST(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { orgId } = r.session

  const b = await request.json().catch(() => null)
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const especie = txt(b.especie)
  const tipo = txt(b.tipo)
  const vendedor_nombre = txt(b.vendedor_nombre)
  const cantidad = num(b.cantidad)
  const precio_unitario = num(b.precio_unitario)
  const arbitraje = (b.arbitraje === 'internacional' ? 'internacional' : 'nacional') as ArbitrajeTipo

  if (!especie || !tipo) return NextResponse.json({ error: 'Falta el tipo de café' }, { status: 400 })
  if (!vendedor_nombre) return NextResponse.json({ error: 'Falta el nombre del vendedor' }, { status: 400 })
  if (!cantidad || cantidad <= 0) return NextResponse.json({ error: 'La cantidad debe ser mayor a 0' }, { status: 400 })
  if (precio_unitario == null || precio_unitario <= 0) {
    return NextResponse.json({ error: 'El precio debe ser mayor a 0' }, { status: 400 })
  }

  const supabase = await createClient()

  // Plantilla del producto (cláusulas + unidad/moneda por defecto).
  const { data: plantilla, error: pErr } = await supabase
    .from('contrato_plantilla')
    .select('unidad, moneda, calidad_texto, costalera_texto, condiciones_texto')
    .eq('especie', especie)
    .eq('tipo', tipo)
    .maybeSingle()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 })
  if (!plantilla) {
    return NextResponse.json({ error: `No hay plantilla para ${especie} ${tipo}` }, { status: 400 })
  }

  // Config del comprador (cláusula de arbitraje + lugar de firma).
  const { data: cfg } = await supabase
    .from('contrato_config')
    .select('arbitraje_nacional_texto, arbitraje_internacional_texto, lugar_firma')
    .maybeSingle()

  const arbitraje_texto =
    arbitraje === 'internacional'
      ? cfg?.arbitraje_internacional_texto ?? null
      : cfg?.arbitraje_nacional_texto ?? null

  const fila = {
    org_id: orgId,
    fecha: txt(b.fecha) ?? new Date().toISOString().slice(0, 10),
    ciclo: txt(b.ciclo),
    productor_id: txt(b.productor_id),
    vendedor_nombre,
    vendedor_domicilio: txt(b.vendedor_domicilio),
    vendedor_curp: txt(b.vendedor_curp),
    vendedor_rfc: txt(b.vendedor_rfc),
    vendedor_telefono: txt(b.vendedor_telefono),
    comunidad: txt(b.comunidad),
    municipio: txt(b.municipio),
    especie,
    tipo,
    cantidad,
    unidad: txt(b.unidad) ?? plantilla.unidad,
    precio_unitario,
    moneda: txt(b.moneda) ?? plantilla.moneda,
    anticipo: num(b.anticipo) ?? 0,
    fecha_entrega: txt(b.fecha_entrega),
    arbitraje,
    // Snapshot inmutable de cláusulas.
    calidad_texto: txt(b.calidad_texto) ?? plantilla.calidad_texto,
    costalera_texto: txt(b.costalera_texto) ?? plantilla.costalera_texto,
    condiciones_texto: txt(b.condiciones_texto) ?? plantilla.condiciones_texto,
    arbitraje_texto,
    lugar_firma: txt(b.lugar_firma) ?? cfg?.lugar_firma ?? null,
    observaciones: txt(b.observaciones),
    creado_por: r.session.userId ?? null,
    estado: 'borrador' as const,
  }

  const { data, error } = await supabase
    .from('contrato_fijacion')
    .insert(fila)
    .select('id, folio')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, id: data.id, folio: data.folio })
}
