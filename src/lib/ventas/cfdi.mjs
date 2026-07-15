// ============================================================================
// Motor puro del Módulo Ventas: parseo de CFDI 4.0 + clasificación de líneas.
// ----------------------------------------------------------------------------
// Fuente única de verdad, igual que acopio/calculo.mjs: la usa el cliente
// (importador browser-side) y el servidor (recalcula antes de insertar).
// En navegador parsea con DOMParser (spec del SAT); en Node (scripts de
// verificación) cae a un tokenizador de tags propio — el CFDI es XML plano
// generado a máquina y sólo necesitamos atributos, no árbol.
// Verificado con scripts/verify-ventas-cfdi.mjs (factura real 4138).
// ============================================================================

// Reglas de clasificación en ORDEN DE PRIORIDAD: la primera que aparezca en la
// descripción (normalizada a mayúsculas sin acentos) gana. "ORO VERDE" debe
// evaluarse antes que "CAFE" para que el café verde a granel no caiga en
// Café Tostado.
export const REGLAS_LINEA = [
  { tokens: ['ORO VERDE'], linea: 'Café Verde' },
  { tokens: ['ORO ROBUSTA'], linea: 'Café Robusta Export.' },
  { tokens: ['CACAO FERMENTADO', 'CACAO LAVADO', 'CACAO EN GRANO'], linea: 'Cacao en Grano' },
  { tokens: ['MIEL'], linea: 'Miel' },
  { tokens: ['CHOCOLATE', 'NIBS', 'LICOR', 'CACAO PASTA'], linea: 'Chocolate y Derivados' },
  { tokens: ['CANELA'], linea: 'Canela' },
  { tokens: ['CAFE'], linea: 'Café Tostado' },
]

export const LINEA_DEFAULT = 'Otros'

export const LINEAS = [...new Set(REGLAS_LINEA.map((r) => r.linea)), LINEA_DEFAULT]

// Mayúsculas + sin acentos, para que "CAFÉ" y "CAFE" clasifiquen igual.
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

export function clasificarLinea(descripcion) {
  const desc = normalizar(descripcion)
  for (const regla of REGLAS_LINEA) {
    if (regla.tokens.some((t) => desc.includes(t))) return regla.linea
  }
  return LINEA_DEFAULT
}

// ----------------------------------------------------------------------------
// Extracción de tags. Devuelve [{ name, attrs }] con name SIN prefijo de
// namespace (Comprobante, Receptor, Concepto, TimbreFiscalDigital...).
// ----------------------------------------------------------------------------
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function decodificarEntidades(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|#x?[0-9a-fA-F]+);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return ENTIDADES[e]
  })
}

function extraerTagsConDom(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('XML mal formado: no se pudo parsear')
  }
  const tags = []
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    const attrs = {}
    for (const a of Array.from(el.attributes)) attrs[a.name.replace(/^.*:/, '')] = a.value
    attrs.__xmlns = el.namespaceURI ?? ''
    tags.push({ name: el.localName, attrs })
  }
  return tags
}

function extraerTagsConTokenizador(xml) {
  // Fuera comentarios, CDATA (la Addenda puede traer XML embebido) y <?...?>.
  const limpio = xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
  const tags = []
  for (const m of limpio.matchAll(/<([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/g)) {
    const attrs = {}
    for (const am of m[2].matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const nombre = am[1].replace(/^.*:/, '')
      attrs[nombre] = decodificarEntidades(am[2] ?? am[3] ?? '')
    }
    if (attrs.xmlns) attrs.__xmlns = attrs.xmlns
    tags.push({ name: m[1].replace(/^.*:/, ''), attrs })
  }
  return tags
}

function extraerTags(xml) {
  return typeof DOMParser !== 'undefined' ? extraerTagsConDom(xml) : extraerTagsConTokenizador(xml)
}

// ----------------------------------------------------------------------------
// parsearCfdi(xml) → factura normalizada.
// Acepta CFDI 4.0 (namespace oficial http://www.sat.gob.mx/cfd/4); tolera
// variantes del namespace siempre que Comprobante@Version sea 4.x.
// ----------------------------------------------------------------------------
export function parsearCfdi(xml) {
  const tags = extraerTags(xml)

  const comprobante = tags.find((t) => t.name === 'Comprobante')
  if (!comprobante) throw new Error('No es un CFDI: falta el nodo Comprobante')

  const ns = comprobante.attrs.__xmlns ?? ''
  const version = comprobante.attrs.Version ?? ''
  const esCfdi4 = ns.includes('sat.gob.mx/cfd') || version.startsWith('4')
  if (!esCfdi4) {
    throw new Error(`CFDI no soportado (Version="${version}", xmlns="${ns}"); se espera CFDI 4.0`)
  }

  const receptor = tags.find((t) => t.name === 'Receptor')
  if (!receptor) throw new Error('CFDI sin nodo Receptor')

  const timbre = tags.find((t) => t.name === 'TimbreFiscalDigital')

  const conceptos = tags
    .filter((t) => t.name === 'Concepto')
    .map((t) => {
      const descripcion = t.attrs.Descripcion ?? ''
      return {
        descripcion,
        claveProdServ: t.attrs.ClaveProdServ ?? null,
        claveUnidad: t.attrs.ClaveUnidad ?? null,
        cantidad: Number(t.attrs.Cantidad ?? 0),
        valorUnitario: Number(t.attrs.ValorUnitario ?? 0),
        importe: Number(t.attrs.Importe ?? 0),
        linea: clasificarLinea(descripcion),
      }
    })
  if (conceptos.length === 0) throw new Error('CFDI sin conceptos')

  return {
    // Comprobante@Fecha viene como ISO local "2026-01-15T10:23:00" → solo fecha
    fecha: String(comprobante.attrs.Fecha ?? '').slice(0, 10),
    total: Number(comprobante.attrs.Total ?? 0),
    folioInterno: comprobante.attrs.Folio ?? null,
    // UUID del timbre; si el XML aún no está timbrado, no hay identidad fiscal.
    folioFiscal: timbre?.attrs.UUID ?? null,
    receptor: {
      rfc: receptor.attrs.Rfc ?? '',
      nombre: receptor.attrs.Nombre ?? '',
      regimenFiscal: receptor.attrs.RegimenFiscalReceptor ?? null,
    },
    conceptos,
  }
}

// Suma de conceptos, para cuadrar contra Comprobante@Total en el resumen de
// importación (los impuestos hacen que difieran; se muestra, no se bloquea).
export function sumaConceptos(factura) {
  return factura.conceptos.reduce((acc, c) => acc + c.importe, 0)
}
