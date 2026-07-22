// Puntos GPS levantados a pie en la parcela (captura desde la ficha).
// La geometría "de verdad" la calcula PostGIS al guardar el polígono; lo de
// aquí es para que el inspector vea el área EN EL MOMENTO y se dé cuenta si le
// falta caminar una esquina, antes de bajarse del predio.

export interface PuntoGps {
  lat: number
  lng: number
  /** Precisión reportada por el GPS, en metros. */
  acc: number | null
  /** Marca de tiempo de la lectura. */
  t: number
}

/** Clave donde se guardan los puntos de una parcela dentro de las respuestas. */
export function clavePuntos(parcelaId: string): string {
  return `gps_puntos::${parcelaId}`
}

export function leerPuntos(respuestas: Record<string, unknown>, parcelaId: string): PuntoGps[] {
  const v = respuestas[clavePuntos(parcelaId)]
  return Array.isArray(v) ? (v as PuntoGps[]) : []
}

const R_TIERRA_M = 6_371_000

/** Distancia en metros entre dos puntos (haversine). */
export function distanciaM(a: PuntoGps, b: PuntoGps): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

/**
 * Área del polígono en hectáreas. Proyecta a metros con una equirectangular
 * local (a escala de una parcela el error es despreciable) y aplica la fórmula
 * del cordón de zapato.
 */
export function areaHa(puntos: PuntoGps[]): number {
  if (puntos.length < 3) return 0
  const rad = Math.PI / 180
  const lat0 = puntos.reduce((s, p) => s + p.lat, 0) / puntos.length
  const cosLat = Math.cos(lat0 * rad)
  const xy = puntos.map((p) => ({
    x: p.lng * rad * R_TIERRA_M * cosLat,
    y: p.lat * rad * R_TIERRA_M,
  }))
  let s = 0
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i]
    const b = xy[(i + 1) % xy.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s / 2) / 10_000
}

/** Perímetro en metros, cerrando el anillo. */
export function perimetroM(puntos: PuntoGps[]): number {
  if (puntos.length < 2) return 0
  let d = 0
  for (let i = 0; i < puntos.length; i++) {
    d += distanciaM(puntos[i], puntos[(i + 1) % puntos.length])
  }
  return d
}

/**
 * GeoJSON del anillo, cerrado (el primer punto se repite al final, como pide
 * la especificación). Devuelve null si no hay suficientes puntos para un
 * polígono.
 */
export function aGeoJSON(puntos: PuntoGps[]): { type: 'Polygon'; coordinates: number[][][] } | null {
  if (puntos.length < 3) return null
  const anillo = puntos.map((p) => [p.lng, p.lat])
  const [x0, y0] = anillo[0]
  const [xn, yn] = anillo[anillo.length - 1]
  if (x0 !== xn || y0 !== yn) anillo.push([x0, y0])
  return { type: 'Polygon', coordinates: [anillo] }
}

/**
 * Huella corta de un conjunto de puntos. Sirve para no crear una versión nueva
 * del polígono cada vez que se reguarda la misma ficha sin haber caminado nada.
 */
export function huellaPuntos(puntos: PuntoGps[]): string {
  const s = puntos.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(';')
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}
