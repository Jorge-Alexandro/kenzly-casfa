// Server-side data access for the GeoSIC module.
// All queries run through the user's RLS context (anon key + session cookie),
// so org isolation is enforced by Postgres, not by us passing org_id around.
import { createClient } from '@/lib/supabase/server'
import type { ParcelaGeoRow, ProductorDashboardRow } from '@/lib/types'

// Aggregated productores for the dashboard (Modulo 2).
export async function getProductoresDashboard(): Promise<
  ProductorDashboardRow[]
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_productores_dashboard')
  if (error) {
    throw new Error(`getProductoresDashboard failed: ${error.message}`)
  }
  return (data ?? []) as ProductorDashboardRow[]
}

// Flat list of every parcela with its active polygon scalars (or nulls).
// Backed by the get_parcelas_geo() RPC — see supabase/migrations.
export async function getParcelasGeo(): Promise<ParcelaGeoRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_parcelas_geo')

  if (error) {
    // Surface the error — we never silently swallow it.
    throw new Error(`getParcelasGeo failed: ${error.message}`)
  }
  return (data ?? []) as ParcelaGeoRow[]
}

// GeoJSON geometry for every active polygon, keyed by parcela_id.
// Returned as a FeatureCollection ready to hand to a Mapbox source.
export async function getParcelaPolygons(): Promise<
  GeoJSON.FeatureCollection<GeoJSON.Polygon>
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_parcela_polygons')

  if (error) {
    throw new Error(`getParcelaPolygons failed: ${error.message}`)
  }

  // The RPC returns rows: { parcela_id, estado_validacion, geojson }
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = (data ?? []).map(
    (row: {
      parcela_id: string
      estado_validacion: string
      geojson: GeoJSON.Polygon
    }) => ({
      type: 'Feature' as const,
      geometry: row.geojson,
      properties: {
        parcela_id: row.parcela_id,
        estado_validacion: row.estado_validacion,
      },
    }),
  )

  return { type: 'FeatureCollection', features }
}
