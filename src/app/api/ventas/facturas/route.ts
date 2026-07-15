// POST /api/ventas/facturas — importa UN CFDI 4.0.
// El navegador ya parseó y mostró el resumen, pero el servidor RE-PARSEA el
// XML con el mismo motor (lib/ventas/cfdi.mjs): no se confía en números del
// cliente. Efectos: upsert de cliente por RFC, alta de productos nuevos por
// descripción, XML original al bucket privado cfdi-xml, factura + detalles.
// Body: { xml: string }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { parsearCfdi } from '@/lib/ventas/cfdi.mjs'
import type { FacturaCfdi } from '@/lib/ventas/cfdi.mjs'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const xml = typeof body?.xml === 'string' ? body.xml : ''
  if (!xml.trim()) return NextResponse.json({ error: 'Falta el XML' }, { status: 400 })

  let factura: FacturaCfdi
  try {
    factura = parsearCfdi(xml)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
  if (!factura.folioFiscal) {
    return NextResponse.json({ error: 'CFDI sin timbre fiscal (UUID); no se puede archivar' }, { status: 400 })
  }
  if (!factura.receptor.rfc) {
    return NextResponse.json({ error: 'CFDI sin RFC de receptor' }, { status: 400 })
  }

  const supabase = await createClient()

  // Duplicado: mismo UUID fiscal ya importado → 409 (idempotente para el UI).
  const { data: existente } = await supabase
    .from('ventas_factura')
    .select('id, folio_interno')
    .eq('folio_fiscal', factura.folioFiscal)
    .maybeSingle()
  if (existente) {
    return NextResponse.json(
      { error: `Esta factura ya fue importada (folio ${existente.folio_interno ?? 's/n'})` },
      { status: 409 },
    )
  }

  // Cliente por RFC (upsert: el nombre del CFDI manda, el SAT lo valida).
  const { data: cliente, error: cliErr } = await supabase
    .from('ventas_cliente')
    .upsert(
      {
        org_id: session.orgId,
        rfc: factura.receptor.rfc,
        nombre: factura.receptor.nombre,
        regimen_fiscal: factura.receptor.regimenFiscal,
      },
      { onConflict: 'org_id,rfc' },
    )
    .select('id')
    .single()
  if (cliErr) return NextResponse.json({ error: cliErr.message }, { status: 400 })

  // Productos: uno por descripción de concepto. Si ya existe NO se toca (la
  // línea/kg_por_unidad curados a mano mandan); los nuevos nacen con la línea
  // clasificada y kg_por_unidad 1 (se afina en el catálogo).
  const productoIds = new Map<string, string>()
  for (const c of factura.conceptos) {
    if (productoIds.has(c.descripcion)) continue
    const { data: ya } = await supabase
      .from('ventas_producto')
      .select('id')
      .eq('nombre', c.descripcion)
      .maybeSingle()
    if (ya) {
      productoIds.set(c.descripcion, ya.id)
      continue
    }
    const { data: prod, error: prodErr } = await supabase
      .from('ventas_producto')
      .insert({
        org_id: session.orgId,
        nombre: c.descripcion,
        linea: c.linea,
        unidad: c.claveUnidad === 'KGM' ? 'KG' : (c.claveUnidad ?? 'PZA'),
        clave_sat: c.claveProdServ,
      })
      .select('id')
      .single()
    if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 400 })
    productoIds.set(c.descripcion, prod.id)
  }

  // XML original al bucket privado (documento fiscal; se lee con signed URL).
  const rutaXml = `${session.orgId}/${factura.folioFiscal}.xml`
  const { error: upErr } = await supabase.storage
    .from('cfdi-xml')
    .upload(rutaXml, new Blob([xml], { type: 'text/xml' }), { upsert: true })
  if (upErr) return NextResponse.json({ error: `Storage: ${upErr.message}` }, { status: 400 })

  const { data: fRow, error: fErr } = await supabase
    .from('ventas_factura')
    .insert({
      org_id: session.orgId,
      folio_fiscal: factura.folioFiscal,
      folio_interno: factura.folioInterno,
      cliente_id: cliente.id,
      fecha: factura.fecha,
      total: factura.total,
      xml_url: rutaXml,
    })
    .select('id')
    .single()
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 400 })

  // Detalles: importe recalculado por el servidor (cantidad × valorUnitario,
  // redondeado a centavos) — el Importe del XML se usa como cuadre.
  const detalles = factura.conceptos.map((c) => ({
    org_id: session.orgId,
    factura_id: fRow.id,
    producto_id: productoIds.get(c.descripcion)!,
    cliente_id: cliente.id,
    cantidad: c.cantidad,
    precio_unitario: c.valorUnitario,
    importe: Math.round(c.cantidad * c.valorUnitario * 100) / 100,
    fecha: factura.fecha,
    origen: 'cfdi' as const,
  }))
  const { error: dErr } = await supabase.from('ventas_detalle').insert(detalles)
  if (dErr) {
    // No dejar la factura sin conceptos: revertimos la cabecera.
    await supabase.from('ventas_factura').delete().eq('id', fRow.id)
    return NextResponse.json({ error: dErr.message }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    id: fRow.id,
    folio_interno: factura.folioInterno,
    conceptos: detalles.length,
    total: factura.total,
  })
}
