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

  // El vendedor vive en el padrón de ACOPIO. Si es nuevo, se da de alta solo:
  // así el mismo nombre queda disponible al capturar la entrada y no se
  // escriben dos variantes del mismo proveedor.
  const comunidad = txt(b.comunidad)
  const municipio = txt(b.municipio)
  const { data: prov } = await supabase
    .from('acopio_proveedor')
    .select('id, activo')
    .eq('nombre', vendedor_nombre)
    .maybeSingle()

  if (!prov) {
    const { error: provErr } = await supabase
      .from('acopio_proveedor')
      .insert({ org_id: orgId, nombre: vendedor_nombre, comunidad, municipio, activo: true })
    // Que falle el alta del padrón no debe tumbar el contrato: el contrato ya
    // guarda el nombre. Se reporta como aviso.
    if (provErr) console.error('No se pudo dar de alta el proveedor:', provErr.message)
  } else if (prov.activo === false) {
    await supabase.from('acopio_proveedor').update({ activo: true }).eq('id', prov.id)
  }

  // Plantilla del producto (cláusulas + unidad/moneda por defecto).
  const { data: plantilla, error: pErr } = await supabase
    .from('contrato_plantilla')
    .select('unidad, moneda, factor_quintal, calidad_texto, costalera_texto, condiciones_texto')
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

  // Kilos ↔ quintales: el servidor es la autoridad de la equivalencia. Si el
  // cliente manda quintales se respetan; si no, se derivan del factor del
  // producto (57.5 pergamino, 45.35 oro, 80 cerezo). El cacao no tiene factor.
  const factor = (plantilla.factor_quintal as number | null) ?? null
  const quintalesEnviados = num(b.quintales)
  const quintalesFinal =
    quintalesEnviados != null && quintalesEnviados > 0
      ? Math.round(quintalesEnviados * 1000) / 1000
      : factor && factor > 0
        ? Math.round((cantidad / factor) * 1000) / 1000
        : null

  const fila = {
    org_id: orgId,
    fecha: txt(b.fecha) ?? new Date().toISOString().slice(0, 10),
    ciclo: txt(b.ciclo),
    // productor_id apunta al padrón de CERTIFICACIÓN. El vendedor ahora sale del
    // padrón de ACOPIO, que es otra tabla, así que no se enlaza por id: el
    // contrato conserva el nombre (snapshot) y ése es el que amarra la boleta.
    productor_id: null,
    vendedor_nombre,
    vendedor_domicilio: txt(b.vendedor_domicilio),
    vendedor_curp: txt(b.vendedor_curp),
    vendedor_rfc: txt(b.vendedor_rfc),
    vendedor_telefono: txt(b.vendedor_telefono),
    comunidad: txt(b.comunidad),
    municipio: txt(b.municipio),
    especie,
    tipo,
    // El precio se pacta POR KILO: `cantidad` son kilos y `precio_unitario` es
    // el precio del kilo (el importe lo calcula la columna generada). Los
    // quintales van aparte, para el papel; si no vienen, se derivan del factor.
    cantidad,
    unidad: txt(b.unidad) ?? plantilla.unidad ?? 'kg',
    precio_unitario,
    quintales: quintalesFinal,
    factor_quintal: factor,
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
