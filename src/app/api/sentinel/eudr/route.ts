// POST /api/sentinel/eudr
// Tamizado EUDR (2020 → hoy) de un LOTE de parcelas: una consulta Sentinel-2 por
// parcela cubriendo desde 2020, clasifica el riesgo de pérdida de cobertura y lo
// guarda en parcela_eudr. Igual que /sentinel/ndvi: por lotes chicos desde el
// cliente para no chocar con el timeout serverless.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { obtenerIndices } from '@/lib/satelite/sentinel'
import { clasificarEudr } from '@/lib/satelite/eudr'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MAX_POR_LOTE = 8
const CONCURRENCIA = 2

interface ResultadoParcela {
  parcela_id: string
  codigo: string
  clasificacion: string
  delta: number | null
  error: string | null
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'coordinador') {
    return NextResponse.json({ error: 'No tienes permiso para el análisis EUDR' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const ids: unknown = body?.parcela_ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
    return NextResponse.json({ error: 'Falta parcela_ids (arreglo de uuid)' }, { status: 400 })
  }
  if (ids.length > MAX_POR_LOTE) {
    return NextResponse.json({ error: `Máximo ${MAX_POR_LOTE} parcelas por lote` }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: poligonos, error: errPoly } = await supabase.rpc('get_poligonos_satelite', { p_ids: ids })
  if (errPoly) return NextResponse.json({ error: errPoly.message }, { status: 400 })

  const filas = (poligonos ?? []) as unknown as {
    parcela_id: string
    codigo_parcela: string
    srid: number
    geojson: GeoJSON.Polygon
  }[]
  if (filas.length === 0) return NextResponse.json({ ok: true, resultados: [] as ResultadoParcela[] })

  const hoy = new Date().toISOString().slice(0, 10)

  async function procesar(fila: (typeof filas)[number]): Promise<ResultadoParcela> {
    const base = { parcela_id: fila.parcela_id, codigo: fila.codigo_parcela, clasificacion: 'sin_datos', delta: null as number | null, error: null as string | null }
    try {
      // Serie mensual desde 2020 (una sola llamada por parcela).
      const serie = await obtenerIndices(fila.geojson, fila.srid, '2020-01-01', hoy, 30)
      const r = clasificarEudr(serie)
      const { error } = await supabase.from('parcela_eudr').upsert(
        {
          parcela_id: fila.parcela_id,
          org_id: session!.orgId,
          ndvi_2020: r.ndvi_2020,
          ndvi_actual: r.ndvi_actual,
          delta: r.delta,
          min_post2020: r.min_post2020,
          fecha_min: r.fecha_min,
          imagenes: r.imagenes,
          clasificacion: r.clasificacion,
          analizado_en: new Date().toISOString(),
        },
        { onConflict: 'parcela_id' },
      )
      if (error) throw new Error(error.message)
      return { ...base, clasificacion: r.clasificacion, delta: r.delta }
    } catch (e) {
      return { ...base, error: e instanceof Error ? e.message : 'Error' }
    }
  }

  const resultados: ResultadoParcela[] = []
  for (let i = 0; i < filas.length; i += CONCURRENCIA) {
    resultados.push(...(await Promise.all(filas.slice(i, i + CONCURRENCIA).map(procesar))))
  }
  return NextResponse.json({ ok: true, resultados })
}
