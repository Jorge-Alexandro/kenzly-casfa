// ============================================================================
// Motor puro del Módulo Ventas: parseo de CFDI 4.0 + clasificación de líneas.
// ----------------------------------------------------------------------------
// Fuente única de verdad, igual que acopio/calculo.mjs: la usa el cliente
// (importador browser-side) y el servidor (recalcula antes de insertar).
// El lector de tags (XML → [{name, attrs}]) vive en lib/cfdi/extraer.mjs,
// compartido con el importador de facturas de COMPRA de Contabilidad — es el
// mismo CFDI del SAT visto desde los dos lados de la operación.
// Verificado con scripts/verify-ventas-cfdi.mjs (factura real 4138).
// ============================================================================
import { extraerTags } from '../cfdi/extraer.mjs'

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
