// SateliteSIC — monitoreo satelital (Server Component).
// Mismo esqueleto que GeoSIC: los datos se traen en el servidor y bajan como
// props planas al shell interactivo. Aquí las parcelas se pintan por NDVI
// (salud de la vegetación) en vez de por estado de validación.
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getParcelasSatelite, getPolygonsSatelite } from '@/lib/data/satelite'
import { calcularSatStats } from '@/lib/satelite/indices'
import SateliteShell from '@/components/satelite/SateliteShell'
import NoMembership from '@/components/geosic/NoMembership'

export const dynamic = 'force-dynamic' // siempre datos frescos por sesión

export default async function SatelitePage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const [parcelas, poligonos] = await Promise.all([
    getParcelasSatelite(),
    getPolygonsSatelite(),
  ])

  // El mapa colorea por NDVI, así que el índice viaja DENTRO de las properties
  // del feature. -999 = sin medición (Mapbox no sabe interpolar sobre null).
  const ndviPorParcela = new Map(
    parcelas.map((p) => [p.id, p.ndvi_promedio]),
  )

  const polygons: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
    type: 'FeatureCollection',
    features: poligonos.map((row) => ({
      type: 'Feature' as const,
      geometry: row.geojson,
      properties: {
        parcela_id: row.parcela_id,
        ndvi: ndviPorParcela.get(row.parcela_id) ?? -999,
      },
    })),
  }

  const stats = calcularSatStats(parcelas)

  return (
    <SateliteShell
      session={result.session}
      parcelas={parcelas}
      polygons={polygons}
      stats={stats}
    />
  )
}
