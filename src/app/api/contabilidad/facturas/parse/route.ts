// POST /api/contabilidad/facturas/parse — lee un CFDI (.xml) o una factura en
// .pdf y devuelve los campos detectados para PRE-LLENAR el formulario manual
// de "Agregar factura". Nunca escribe nada: sólo Vicky, revisando lo que se
// detectó, decide guardar con el botón de siempre (POST /api/contabilidad/facturas).
//
//   .xml → parsearCfdiCompra: exacto, el XML es la fuente fiscal real.
//   .pdf → texto + heurísticas (extractText de unpdf + regex): cada PAC arma
//          su PDF con su propia plantilla, así que esto es "mejor que nada",
//          no "tan confiable como el XML" — se marca con confianza='estimado'.
import { NextResponse } from 'next/server'
import { getSessionResult } from '@/lib/session'
import { parsearCfdiCompra } from '@/lib/facturas/cfdi-compra.mjs'
import { extraerDeTextoPdf } from '@/lib/facturas/cfdi-pdf.mjs'
import { getDocumentProxy, extractText } from 'unpdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const guard = (rol: string) => rol === 'admin' || rol === 'contador'

export async function POST(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!guard(r.session.rol)) {
    return NextResponse.json({ error: 'Sólo Contabilidad puede importar facturas.' }, { status: 403 })
  }

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
      const f = parsearCfdiCompra(bytes.toString('utf8'))
      return NextResponse.json({
        ok: true,
        fuente: 'xml',
        confianza: 'alta',
        folio: f.folio,
        fecha: f.fecha,
        monto: f.total,
        uuid_fiscal: f.uuidFiscal,
        emisor_nombre: f.emisor.nombre,
        emisor_rfc: f.emisor.rfc,
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
    return NextResponse.json({
      ok: true,
      fuente: 'pdf',
      confianza: 'estimado',
      folio: campos.folio,
      fecha: campos.fecha,
      monto: campos.monto,
      uuid_fiscal: campos.uuidFiscal,
      emisor_rfc: campos.emisorRfc,
      camposDetectados: campos.camposDetectados,
      camposTotal: campos.camposTotal,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se pudo leer el archivo' }, { status: 400 })
  }
}
