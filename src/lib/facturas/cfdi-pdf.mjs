// ============================================================================
// Heurísticas sobre el TEXTO de un PDF de factura (cuando Vicky sólo tiene el
// PDF, no el XML timbrado). A diferencia de parsearCfdiCompra —que lee un XML
// con estructura fija del SAT—, un PDF es un documento visual: cada emisor de
// facturas (PAC) lo arma con su propia plantilla, así que aquí NO hay una
// estructura confiable que leer, sólo patrones de texto que SUELEN aparecer.
//
// Por diseño esto es "mejor que nada", no "tan bueno como el XML": se marca
// cada campo con su nivel de confianza y el formulario deja TODO editable —
// la app nunca guarda lo que este heurístico encuentra sin que Vicky lo vea
// primero en el campo de captura manual.
// ============================================================================

// UUID de 8-4-4-4-12: el Folio Fiscal se imprime SIEMPRE en este formato,
// sea cual sea la plantilla del PAC — es la señal más confiable del PDF.
const RE_UUID = /\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\b/
const RE_RFC = /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/
const RE_FECHA_ISO = /\b(20\d{2})-(\d{2})-(\d{2})\b/
const RE_FECHA_DMY = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/

/** "$12,345.67" o "12345.67" con hasta 2 decimales → 12345.67. */
function aMonto(texto) {
  const limpio = texto.replace(/[^\d.]/g, '')
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/**
 * El monto que sigue a la palabra "Total" — con cuidado de NO enganchar
 * "SubTotal" (que también contiene "Total" y casi siempre aparece antes, con
 * un número más chico: tomarlo por descuido subvalúa la factura).
 */
function buscarTotal(texto) {
  const re = /(?<![A-Za-zÀ-ÿ])Total\b[^$\d\n]{0,20}\$?\s*([\d,]+\.\d{2})/gi
  const m = re.exec(texto)
  return m ? aMonto(m[1]) : null
}

/** La primera fecha reconocible (ISO o dd/mm/aaaa) → 'YYYY-MM-DD'. */
function buscarFecha(texto) {
  const iso = texto.match(RE_FECHA_ISO)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = texto.match(RE_FECHA_DMY)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return null
}

/** "Folio: A-123" / "Folio A123" cerca del rótulo. */
function buscarFolio(texto) {
  const m = texto.match(/Folio\s*(?:Fiscal)?[:\s]*([A-Za-z0-9-]{1,20})/)
  // "Folio Fiscal" es el UUID, no un folio interno: si el match viene de ahí, se descarta.
  if (m && !RE_UUID.test(m[1]) && !/^Fiscal$/i.test(m[1])) return m[1]
  return null
}

/**
 * @param {string} texto  Texto plano ya extraído del PDF (unpdf u otro).
 * @returns {{
 *   uuidFiscal: string|null, folio: string|null, fecha: string|null,
 *   monto: number|null, emisorRfc: string|null,
 *   camposDetectados: number, camposTotal: number,
 * }}
 */
export function extraerDeTextoPdf(texto) {
  const t = String(texto ?? '')

  const uuidFiscal = t.match(RE_UUID)?.[0] ?? null
  const folio = buscarFolio(t)
  const fecha = buscarFecha(t)
  const monto = buscarTotal(t)

  // RFC: sólo informativo (no hay campo en el formulario para guardarlo). Si
  // aparecen varios, se toma el primero — no hay forma confiable de saber cuál
  // es el emisor sin la estructura del XML.
  const emisorRfc = t.match(RE_RFC)?.[0] ?? null

  const campos = [uuidFiscal, folio, fecha, monto]
  return {
    uuidFiscal, folio, fecha, monto, emisorRfc,
    camposDetectados: campos.filter((c) => c != null).length,
    camposTotal: campos.length,
  }
}
