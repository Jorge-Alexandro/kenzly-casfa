// ============================================================================
// QR → SVG. Sirve igual para imprimir la etiqueta y para mostrarla en pantalla.
// ----------------------------------------------------------------------------
// Se usa qrcode-generator (MIT, ~10 kB) en vez de escribirlo a mano: un
// codificador QR necesita Reed-Solomon y las tablas de versión/máscara, y una
// implementación casera mal probada produciría etiquetas que fallan en el 2% de
// los casos — justo el tipo de error que sólo se descubre con el café ya en el
// camión.
//
// Nivel de corrección de error 'H' (30%): la etiqueta va colgada en un saco de
// yute que se moja, se arrastra y se estiba. Puede perder casi un tercio de su
// superficie y seguir leyéndose. Ese margen es la razón de elegir QR sobre
// código de barras.
// ============================================================================
import qrcode from 'qrcode-generator'

/**
 * Devuelve el QR como un único path SVG (mucho más ligero que un rect por
 * módulo: 21×21 = 441 elementos vs 1).
 * @param {string} texto
 * @param {number} modulos  tamaño del viewBox = número de módulos
 */
export function qrPath(texto) {
  const qr = qrcode(0, 'H') // versión automática, corrección alta
  qr.addData(texto)
  qr.make()

  const n = qr.getModuleCount()
  let d = ''
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(f, c)) d += `M${c} ${f}h1v1h-1z`
    }
  }
  return { d, modulos: n }
}
