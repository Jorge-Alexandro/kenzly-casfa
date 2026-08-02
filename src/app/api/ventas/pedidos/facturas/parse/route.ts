// POST /api/ventas/pedidos/facturas/parse — lee un CFDI (.xml) o una factura
// en .pdf y devuelve los campos para PRE-LLENAR "Agregar factura" de un
// pedido. Nunca escribe nada — espejo exacto de
// /api/contabilidad/facturas/parse, del lado de venta: el XML usa el mismo
// motor que /api/ventas/facturas (lib/ventas/cfdi.mjs), el PDF las mismas
// heurísticas que Contabilidad (lib/facturas/cfdi-pdf.mjs, genérico).
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { parsearCfdi } from '@/lib/ventas/cfdi.mjs'
import { extraerDeTextoPdf } from '@/lib/facturas/cfdi-pdf.mjs'
import { getDocumentProxy, extractText } from 'unpdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** El Folio es opcional en el estándar CFDI; folio interno lo exige la tabla
 * (not null), así que sin uno se arma con los primeros 8 del UUID. */
function folioConRespaldo(folio: string | null, uuidFiscal: string | null) {
  if (folio) return { folio, generado: false }
  if (uuidFiscal) return { folio: uuidFiscal.slice(0, 8).toUpperCase(), generado: true }
  return { folio: null, generado: false }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const b = await request.json().catch(() => null)
  const nombreArchivo = typeof b?.nombreArchivo === 'string' ? b.nombreArchivo : ''
  const contenido = typeof b?.contenido === 'string' ? b.contenido : ''
  if (!contenido) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

  const esPdf = /\.pdf$/i.test(nombreArchivo)
  const esXml = /\.xml$/i.test(nombreArchivo)
  if (!esPdf && !esXml) {
    return NextResponse.json({ error: 'Sólo se aceptan archivos .xml (CFDI) o .pdf' }, { status: 400 })
  }

  let bytes: Buffer
  try {
    bytes = Buffer.from(contenido, 'base64')
  } catch {
    return NextResponse.json({ error: 'El archivo llegó dañado' }, { status: 400 })
  }

  try {
    if (esXml) {
      const f = parsearCfdi(bytes.toString('utf8'))
      const { folio, generado } = folioConRespaldo(f.folioInterno, f.folioFiscal)
      return NextResponse.json({
        ok: true,
        fuente: 'xml',
        confianza: 'alta',
        folio,
        folio_generado: generado,
        fecha: f.fecha,
        monto: f.total,
        uuid_fiscal: f.folioFiscal,
        receptor_nombre: f.receptor.nombre,
        receptor_rfc: f.receptor.rfc,
      })
    }

    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extractText(pdf, { mergePages: true })
    const campos = extraerDeTextoPdf(text)
    if (campos.camposDetectados === 0) {
      return NextResponse.json(
        { error: 'No se pudo leer ningún dato del PDF; captúralo a mano.' },
        { status: 422 },
      )
    }
    const { folio, generado } = folioConRespaldo(campos.folio, campos.uuidFiscal)
    return NextResponse.json({
      ok: true,
      fuente: 'pdf',
      confianza: 'estimado',
      folio,
      folio_generado: generado,
      fecha: campos.fecha,
      monto: campos.monto,
      uuid_fiscal: campos.uuidFiscal,
      camposDetectados: campos.camposDetectados,
      camposTotal: campos.camposTotal,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo leer el archivo' }, { status: 400 })
  }
}
