// ============================================================================
// CFDI de COMPRA (lo que Contabilidad recibe de un proveedor/prestador de
// servicio para pagarlo) — el mismo motor de lib/ventas/cfdi.mjs pero desde
// el otro lado: aquí interesa el EMISOR (quién cobra), no el receptor
// (siempre es CASFA). Sin conceptos ni clasificación: entrada_factura sólo
// guarda folio, fecha, monto y el UUID fiscal.
// ============================================================================
import { extraerTags } from '../cfdi/extraer.mjs'

export function parsearCfdiCompra(xml) {
  const tags = extraerTags(xml)

  const comprobante = tags.find((t) => t.name === 'Comprobante')
  if (!comprobante) throw new Error('No es un CFDI: falta el nodo Comprobante')

  const ns = comprobante.attrs.__xmlns ?? ''
  const version = comprobante.attrs.Version ?? ''
  const esCfdi4 = ns.includes('sat.gob.mx/cfd') || version.startsWith('4')
  if (!esCfdi4) {
    throw new Error(`CFDI no soportado (Version="${version}", xmlns="${ns}"); se espera CFDI 4.0`)
  }

  // Un Complemento de Pago (tipo 'P') trae Total="0": el monto real vive en
  // otro nodo que este importador no lee. Mejor avisar claro que inventar un
  // monto en cero — Vicky captura ese caso a mano.
  const tipo = comprobante.attrs.TipoDeComprobante ?? null
  if (tipo === 'P') {
    throw new Error('Este XML es un Complemento de Pago (REP), no una factura de compra. Captúralo a mano.')
  }

  const emisor = tags.find((t) => t.name === 'Emisor')
  if (!emisor) throw new Error('CFDI sin nodo Emisor')

  const timbre = tags.find((t) => t.name === 'TimbreFiscalDigital')

  const serie = comprobante.attrs.Serie ?? null
  const folioAttr = comprobante.attrs.Folio ?? null
  const folio = serie && folioAttr ? `${serie}${folioAttr}` : (folioAttr ?? serie)

  return {
    // Comprobante@Fecha viene como ISO local "2026-01-15T10:23:00" → solo fecha
    fecha: String(comprobante.attrs.Fecha ?? '').slice(0, 10),
    total: Number(comprobante.attrs.Total ?? 0),
    moneda: comprobante.attrs.Moneda ?? null,
    folio,
    // UUID del timbre; si el XML aún no está timbrado, no hay identidad fiscal.
    uuidFiscal: timbre?.attrs.UUID ?? null,
    emisor: {
      rfc: emisor.attrs.Rfc ?? '',
      nombre: emisor.attrs.Nombre ?? '',
    },
  }
}
