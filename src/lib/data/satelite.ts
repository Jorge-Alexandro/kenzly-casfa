// SateliteSIC — acceso a datos (server-only).
// Todo pasa por RLS con la sesión del usuario (es_miembro), igual que GeoSIC:
// nunca pasamos org_id a mano desde el cliente.
import { createClient } from '@/lib/supabase/server'
import type {
  ParcelaSateliteRow,
  IndiceHistorial,
} from '@/lib/satelite/indices'

export * from '@/lib/satelite/indices' // re-export client-safe (patrón acopio)

// Lista plana: cada parcela con su índice satelital más reciente (o nulls).
export async function getParcelasSatelite(): Promise<ParcelaSateliteRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_parcelas_satelite')
  if (error) throw new Error(`getParcelasSatelite failed: ${error.message}`)
  return (data ?? []) as unknown as ParcelaSateliteRow[]
}

// Geometrías activas (reusa el RPC de GeoSIC — no duplicamos PostGIS).
export async function getPolygonsSatelite(): Promise<
  { parcela_id: string; geojson: GeoJSON.Polygon }[]
> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_parcela_polygons')
  if (error) throw new Error(`getPolygonsSatelite failed: ${error.message}`)
  return (data ?? []) as unknown as {
    parcela_id: string
    geojson: GeoJSON.Polygon
  }[]
}

// Serie histórica de una parcela para la gráfica del panel.
export async function getHistorialSatelite(
  parcelaId: string,
  meses = 6,
): Promise<IndiceHistorial[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_indices_historial', {
    p_parcela_id: parcelaId,
    p_meses: meses,
  })
  if (error) throw new Error(`getHistorialSatelite failed: ${error.message}`)
  return (data ?? []) as unknown as IndiceHistorial[]
}
