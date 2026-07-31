// ============================================================================
// Lector de tags de un CFDI (XML del SAT). Puro, sin significado de negocio —
// lib/ventas/cfdi.mjs (facturas de venta) y lib/facturas/cfdi-compra.mjs
// (facturas de compra que captura Contabilidad) comparten este mismo motor:
// es la MISMA autoridad para leer un CFDI en los dos lados de la operación.
// ----------------------------------------------------------------------------
// En navegador parsea con DOMParser (spec del SAT); en Node (API routes,
// scripts) cae a un tokenizador de tags propio — el CFDI es XML plano
// generado a máquina y sólo necesitamos atributos, no árbol.
// ============================================================================

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

/** [{ name, attrs }] con name SIN prefijo de namespace (Comprobante, Receptor…). */
export function extraerTags(xml) {
  return typeof DOMParser !== 'undefined' ? extraerTagsConDom(xml) : extraerTagsConTokenizador(xml)
}
