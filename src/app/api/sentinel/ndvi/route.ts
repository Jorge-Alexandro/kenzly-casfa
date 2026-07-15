// POST /api/sentinel/ndvi
// Procesa un LOTE de parcelas contra Sentinel-2 y guarda la serie de índices.
//
// Body: { parcela_ids: string[], meses?: number }
//
// Se procesa por lotes chicos a propósito: cada parcela es una llamada HTTP a
// Copernicus (1-3 s), y una función serverless tiene minutos, no horas. El
// cliente (BotonActualizar) trocea las 153 parcelas y va llamando esta ruta con
// una barra de progreso — así nunca chocamos con el timeout y el usuario ve avance.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { obtenerIndices } from '@/lib/satelite/sentinel'
import { calcularAlerta } from '@/lib/satelite/indices'

export const maxDuration = 60 // segundos (Vercel)
export const dynamic = 'force-dynamic'

// Tope de parcelas por request y cuántas van en paralelo contra Sentinel Hub.
const MAX_POR_LOTE = 10
const CONCURRENCIA = 3

interface ResultadoParcela {
  parcela_id: string
  codigo: string
  mediciones: number
  ultimo_ndvi: number | null
  error: string | null
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  // Traer datos satelitales consume cuota de Copernicus: solo coordinación.
  if (session.rol !== 'admin' && session.rol !== 'coordinador') {
    return NextResponse.json(
      { error: 'No tienes permiso para actualizar datos satelitales' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  const ids: unknown = body?.parcela_ids
  const meses = typeof body?.meses === 'number' ? body.meses : 6

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
    return NextResponse.json(
      { error: 'Falta parcela_ids (arreglo de uuid)' },
      { status: 400 },
    )
  }
  if (ids.length > MAX_POR_LOTE) {
    return NextResponse.json(
      { error: `Máximo ${MAX_POR_LOTE} parcelas por lote` },
      { status: 400 },
    )
  }

  const supabase = await createClient()

  // Los polígonos vienen de PostGIS como GeoJSON (SRID 4326). RLS garantiza
  // que solo salen parcelas de la organización del usuario.
  const { data: poligonos, error: errPoly } = await supabase.rpc(
    'get_poligonos_satelite',
    { p_ids: ids },
  )
  if (errPoly) {
    return NextResponse.json({ error: errPoly.message }, { status: 400 })
  }

  // El RPC devuelve la geometría YA reproyectada a su zona UTM (ver 0021):
  // es la rejilla nativa de Sentinel-2 y permite pedir píxeles de 10 m reales.
  const filas = (poligonos ?? []) as unknown as {
    parcela_id: string
    codigo_parcela: string
    area_calc_ha: number | null
    srid: number
    geojson: GeoJSON.Polygon
  }[]

  if (filas.length === 0) {
    return NextResponse.json({ ok: true, resultados: [] as ResultadoParcela[] })
  }

  // Ventana de tiempo: los últimos `meses` meses hasta hoy.
  const hasta = new Date()
  const desde = new Date(hasta)
  desde.setMonth(desde.getMonth() - meses)
  const fDesde = desde.toISOString().slice(0, 10)
  const fHasta = hasta.toISOString().slice(0, 10)

  async function procesar(fila: (typeof filas)[number]): Promise<ResultadoParcela> {
    const base = {
      parcela_id: fila.parcela_id,
      codigo: fila.codigo_parcela,
      mediciones: 0,
      ultimo_ndvi: null as number | null,
      error: null as string | null,
    }

    try {
      const mediciones = await obtenerIndices(
        fila.geojson,
        fila.srid,
        fDesde,
        fHasta,
      )

      if (mediciones.length === 0) {
        // No es un fallo: en temporada de lluvias el Soconusco pasa semanas
        // bajo nube y sencillamente no hay imagen utilizable.
        return { ...base, error: 'Sin imágenes despejadas en el periodo' }
      }

      for (const m of mediciones) {
        const alerta = calcularAlerta(m.ndvi_promedio)
        const { error } = await supabase.rpc('upsert_indice_satelital', {
          p_parcela_id: fila.parcela_id,
          p_fecha_imagen: m.fecha_imagen,
          p_ndvi_promedio: m.ndvi_promedio,
          p_ndvi_min: m.ndvi_min,
          p_ndvi_max: m.ndvi_max,
          p_evi_promedio: m.evi_promedio,
          p_ndwi_promedio: m.ndwi_promedio,
          p_cobertura_nubes: m.cobertura_nubes,
          p_alerta: alerta,
        })
        if (error) throw new Error(error.message)
      }

      const ultima = mediciones[mediciones.length - 1]
      return {
        ...base,
        mediciones: mediciones.length,
        ultimo_ndvi: ultima.ndvi_promedio,
      }
    } catch (e) {
      return {
        ...base,
        error: e instanceof Error ? e.message : 'Error desconocido',
      }
    }
  }

  // Pool de concurrencia fija: no saturamos la cuota de Copernicus ni la función.
  const resultados: ResultadoParcela[] = []
  for (let i = 0; i < filas.length; i += CONCURRENCIA) {
    const lote = filas.slice(i, i + CONCURRENCIA)
    resultados.push(...(await Promise.all(lote.map(procesar))))
  }

  return NextResponse.json({ ok: true, resultados })
}
