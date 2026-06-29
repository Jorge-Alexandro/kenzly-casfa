// Lightweight KML/KMZ -> GeoJSON Polygon parser (no heavy GIS deps).
// Runs server-side in the upload API route.
//
// KML coordinate strings are "lng,lat[,alt] lng,lat[,alt] ...".
// IMPORTANT: KML order is longitude,latitude — we keep it as-is (do NOT swap).
import { unzipSync, strFromU8 } from 'fflate'

export interface ParsedKml {
  polygon: GeoJSON.Polygon
  name: string | null
  // Area is intentionally NOT computed here — PostGIS (::geography) is the
  // source of truth via the geo_recompute() trigger.
}

// Public entry: accepts raw bytes of a .kml or .kmz and returns a GeoJSON Polygon.
export function parseKmlOrKmz(
  bytes: Uint8Array,
  filename: string,
): ParsedKml {
  const isKmz =
    filename.toLowerCase().endsWith('.kmz') || looksLikeZip(bytes)
  const kmlText = isKmz ? extractKmlFromKmz(bytes) : strFromU8(bytes)
  return parseKmlText(kmlText)
}

function looksLikeZip(bytes: Uint8Array): boolean {
  // ZIP local file header magic: 'PK\x03\x04'
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

function extractKmlFromKmz(bytes: Uint8Array): string {
  const files = unzipSync(bytes)
  // Prefer doc.kml, otherwise the first *.kml entry.
  const names = Object.keys(files)
  const kmlName =
    names.find((n) => n.toLowerCase() === 'doc.kml') ??
    names.find((n) => n.toLowerCase().endsWith('.kml'))
  if (!kmlName) {
    throw new Error('El KMZ no contiene ningún archivo .kml')
  }
  return strFromU8(files[kmlName])
}

function parseKmlText(kml: string): ParsedKml {
  const name = extractFirstTag(kml, 'name')

  // Find the first <Polygon> ... </Polygon> block, then its outer boundary.
  const polyMatch = /<Polygon\b[\s\S]*?<\/Polygon>/i.exec(kml)
  if (!polyMatch) {
    throw new Error('No se encontró ningún <Polygon> en el KML')
  }
  const polyBlock = polyMatch[0]

  const outer = extractRing(polyBlock, /outerBoundaryIs/i)
  if (!outer) {
    throw new Error('El polígono no tiene outerBoundaryIs con coordenadas')
  }

  // Inner boundaries (holes) — optional, can be multiple.
  const holes = extractAllRings(polyBlock, /innerBoundaryIs/i)

  const ring = closeRing(outer)
  if (ring.length < 4) {
    throw new Error('El anillo del polígono tiene muy pocos vértices')
  }

  const coordinates: GeoJSON.Position[][] = [ring, ...holes.map(closeRing)]

  return {
    name,
    polygon: { type: 'Polygon', coordinates },
  }
}

// Extract a single ring's coordinates that sits inside a boundary tag.
function extractRing(
  block: string,
  boundaryRegex: RegExp,
): GeoJSON.Position[] | null {
  const idx = block.search(boundaryRegex)
  if (idx === -1) return null
  // From the boundary tag onward, grab the next <coordinates> block.
  const sub = block.slice(idx)
  const coordsText = extractFirstTag(sub, 'coordinates')
  if (!coordsText) return null
  return parseCoordinates(coordsText)
}

function extractAllRings(
  block: string,
  boundaryRegex: RegExp,
): GeoJSON.Position[][] {
  const rings: GeoJSON.Position[][] = []
  const re = new RegExp(boundaryRegex.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    const sub = block.slice(m.index)
    const coordsText = extractFirstTag(sub, 'coordinates')
    if (coordsText) rings.push(parseCoordinates(coordsText))
  }
  return rings
}

// Parse "lng,lat,alt lng,lat,alt ..." -> [[lng,lat], ...] (alt dropped).
function parseCoordinates(text: string): GeoJSON.Position[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tuple) => {
      const parts = tuple.split(',')
      const lng = Number(parts[0])
      const lat = Number(parts[1])
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        throw new Error(`Coordenada inválida en KML: "${tuple}"`)
      }
      return [lng, lat] as GeoJSON.Position
    })
}

// GeoJSON requires the first and last position of a ring to be identical.
function closeRing(ring: GeoJSON.Position[]): GeoJSON.Position[] {
  if (ring.length === 0) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...ring, first]
  }
  return ring
}

// Grab inner text of the first <tag>...</tag> (case-insensitive, namespace-tolerant).
function extractFirstTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = re.exec(xml)
  return m ? m[1].trim() : null
}
