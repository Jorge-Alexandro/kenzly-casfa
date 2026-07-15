// ============================================================================
// Códigos de etiqueta de saco: generación y validación.
// ----------------------------------------------------------------------------
// Formato:  CAS-26-04871-3
//           org  ciclo  consecutivo  dígito verificador
//
// El dígito verificador es lo que permite que el promotor trabaje SIN SEÑAL: la
// app rechaza un código mal leído o mal tecleado en el momento, sin preguntarle
// nada al servidor. Sin esto, un escaneo sucio en la sierra se detectaría hasta
// la sincronización, con el café ya cargado en el camión.
//
// Se usa Damm y no Luhn: Damm detecta TODOS los errores de un solo dígito y
// TODAS las transposiciones de dígitos adyacentes (Luhn falla con 09↔90), que
// son justo los dos errores que comete alguien tecleando un código a mano
// cuando la etiqueta viene raspada y la cámara no la lee.
//
// El código es OPACO a propósito: no lleva nombre ni comunidad. La etiqueta se
// imprime antes de saber a quién le va a tocar; el vínculo con el productor lo
// hace la app al escanearla. Así no se necesita impresora en la comunidad.
// ============================================================================

// Cuasigrupo débilmente totalmente antisimétrico de orden 10 (Damm, 2004).
const DAMM = [
  [0, 3, 1, 7, 5, 9, 8, 6, 4, 2],
  [7, 0, 9, 2, 1, 5, 4, 8, 6, 3],
  [4, 2, 0, 6, 8, 7, 1, 3, 5, 9],
  [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
  [6, 1, 2, 3, 0, 4, 5, 9, 7, 8],
  [3, 6, 7, 4, 2, 0, 9, 5, 8, 1],
  [5, 8, 6, 9, 7, 2, 0, 1, 3, 4],
  [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
  [9, 4, 3, 8, 6, 1, 7, 2, 0, 5],
  [2, 5, 8, 1, 4, 3, 6, 7, 9, 0],
]

/** Dígito verificador Damm de una cadena de dígitos. */
export function digitoDamm(digitos) {
  let x = 0
  for (const c of String(digitos)) {
    const d = c.charCodeAt(0) - 48
    if (d < 0 || d > 9) continue
    x = DAMM[x][d]
  }
  return x
}

/**
 * Arma el código de una etiqueta.
 * @param {string} prefijo    'CAS'
 * @param {string} ciclo      '2025-2026' → usa el año final ('26')
 * @param {number} consecutivo
 */
export function armarCodigo(prefijo, ciclo, consecutivo) {
  const anio = String(ciclo).slice(-2)
  const seq = String(consecutivo).padStart(5, '0')
  const cuerpo = `${anio}${seq}`
  return `${prefijo.toUpperCase()}-${anio}-${seq}-${digitoDamm(cuerpo)}`
}

/**
 * Valida y normaliza un código escaneado o tecleado. Devuelve el código
 * canónico, o null si no es válido.
 *
 * Tolera: minúsculas, espacios, guiones de más o de menos. Un lector de QR sucio
 * y un dedo cansado producen las mismas variantes.
 */
export function validarCodigo(texto) {
  if (!texto) return null
  const limpio = String(texto).trim().toUpperCase().replace(/[\s_]/g, '')
  const m = limpio.match(/^([A-Z]{2,4})-?(\d{2})-?(\d{5})-?(\d)$/)
  if (!m) return null
  const [, prefijo, anio, seq, dv] = m
  if (digitoDamm(`${anio}${seq}`) !== Number(dv)) return null
  return `${prefijo}-${anio}-${seq}-${dv}`
}

/** Genera un rango de códigos consecutivos (para imprimir un rollo). */
export function generarRango(prefijo, ciclo, desde, cantidad) {
  const out = []
  for (let i = 0; i < cantidad; i++) {
    out.push({ consecutivo: desde + i, codigo: armarCodigo(prefijo, ciclo, desde + i) })
  }
  return out
}
