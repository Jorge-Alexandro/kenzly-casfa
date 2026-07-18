// Traslape con la capa de BOSQUE 2020 de la UE (JRC Global Forest Cover 2020 v3).
// Replica el paso geoespacial de MAYACERT: ¿el polígono de la parcela cae sobre
// lo que era bosque en 2020? Cualquier traslape es "riesgo potencial" EUDR.
//
// Método: pedimos al WMS oficial de JRC un GetMap de la capa de bosque sobre el
// recuadro de la parcela; el bosque se pinta opaco (verde) y el no-bosque queda
// transparente. Contamos los píxeles opacos dentro del polígono.
//
// SOLO SERVIDOR (usa fetch + decodificación PNG).
import { PNG } from 'pngjs'

const WMS = 'https://ies-ows.jrc.ec.europa.eu/iforce/gfc2020/wms.py'

export interface ResultadoBosque2020 {
  pct: number // % del área de la parcela que era bosque en 2020
  pixeles_dentro: number
}

// Ray casting: ¿el punto (lon,lat) está dentro del anillo?
function dentroDe(lon: number, lat: number, ring: [number, number][]): boolean {
  let dentro = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      dentro = !dentro
    }
  }
  return dentro
}

export async function analizarBosque2020(
  ring: [number, number][],
): Promise<ResultadoBosque2020> {
  const lons = ring.map((c) => c[0])
  const lats = ring.map((c) => c[1])
  let minLon = Math.min(...lons), maxLon = Math.max(...lons)
  let minLat = Math.min(...lats), maxLat = Math.max(...lats)
  // Margen del 15% para dar contexto al recuadro.
  const dLon = (maxLon - minLon) * 0.15 || 0.001
  const dLat = (maxLat - minLat) * 0.15 || 0.001
  minLon -= dLon; maxLon += dLon; minLat -= dLat; maxLat += dLat

  // Resolución proporcional (~250 px en el lado mayor, tope para no exagerar).
  const anchoDeg = maxLon - minLon, altoDeg = maxLat - minLat
  const LADO = 250
  const W = anchoDeg >= altoDeg ? LADO : Math.max(60, Math.round((anchoDeg / altoDeg) * LADO))
  const H = altoDeg > anchoDeg ? LADO : Math.max(60, Math.round((altoDeg / anchoDeg) * LADO))

  const q = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: 'gfc2020_v3',
    styles: '',
    srs: 'EPSG:4326',
    bbox: `${minLon},${minLat},${maxLon},${maxLat}`,
    width: String(W),
    height: String(H),
    format: 'image/png',
    transparent: 'TRUE',
  })
  const res = await fetch(`${WMS}?${q.toString()}`, {
    headers: { 'User-Agent': 'kenzly-casfa' },
    cache: 'no-store',
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`JRC WMS respondió ${res.status}: ${t.slice(0, 150)}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const png = PNG.sync.read(buf)
  const { width, height, data } = png // data: RGBA

  let dentro = 0
  let bosque = 0
  for (let py = 0; py < height; py++) {
    const lat = maxLat - ((py + 0.5) / height) * (maxLat - minLat)
    for (let px = 0; px < width; px++) {
      const lon = minLon + ((px + 0.5) / width) * (maxLon - minLon)
      if (!dentroDe(lon, lat, ring)) continue
      dentro++
      const a = data[(py * width + px) * 4 + 3] // alpha
      if (a > 40) bosque++ // opaco = bosque 2020
    }
  }

  return {
    pct: dentro > 0 ? Number(((100 * bosque) / dentro).toFixed(1)) : 0,
    pixeles_dentro: dentro,
  }
}

export type ClaseBosque = 'sin_traslape' | 'traslape_parcial' | 'traslape_alto'

// Cualquier traslape con bosque 2020 es riesgo potencial EUDR (criterio MAYACERT).
export function claseBosque(pct: number): ClaseBosque {
  if (pct >= 50) return 'traslape_alto'
  if (pct >= 5) return 'traslape_parcial'
  return 'sin_traslape'
}

export const BOSQUE_LABEL: Record<ClaseBosque, string> = {
  traslape_alto: 'Alto traslape con bosque 2020',
  traslape_parcial: 'Traslape parcial con bosque 2020',
  sin_traslape: 'Sin traslape con bosque 2020',
}

export const BOSQUE_COLOR: Record<ClaseBosque, string> = {
  traslape_alto: '#dc2626',
  traslape_parcial: '#f59e0b',
  sin_traslape: '#16a34a',
}
