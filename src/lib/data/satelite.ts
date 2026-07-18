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

export interface EudrRow {
  parcela_id: string
  estatus_oficial: 'verificada' | 'deforestacion' | null
  fuente: string | null
  fecha_oficial: string | null
  clasificacion: 'sin_cambio' | 'vigilar' | 'posible_perdida' | 'sin_datos' | null
  ndvi_2020: number | null
  ndvi_actual: number | null
  delta: number | null
  min_post2020: number | null
  fecha_min: string | null
  analizado_en: string | null
}

// Resultados EUDR por parcela (parcela_eudr): veredicto oficial + monitoreo NDVI.
export async function getEudr(): Promise<EudrRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('parcela_eudr')
    .select('parcela_id, estatus_oficial, fuente, fecha_oficial, clasificacion, ndvi_2020, ndvi_actual, delta, min_post2020, fecha_min, analizado_en')
  if (error) throw new Error(`getEudr failed: ${error.message}`)
  return (data ?? []) as EudrRow[]
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
