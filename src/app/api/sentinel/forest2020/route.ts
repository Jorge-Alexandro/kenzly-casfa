// POST /api/sentinel/forest2020
// Calcula el % de traslape con la capa de bosque 2020 de la UE (JRC GFC2020 v3)
// para un LOTE de parcelas y lo guarda en parcela_eudr. Replica el paso
// geoespacial de MAYACERT. Por lotes desde el cliente (como los otros análisis).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { analizarBosque2020, claseBosque } from '@/lib/satelite/forest2020'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MAX_POR_LOTE = 12
const CONCURRENCIA = 3

interface ResultadoParcela {
  parcela_id: string
  codigo: string
  pct: number | null
  clase: string
  error: string | null
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (session.rol !== 'admin' && session.rol !== 'coordinador') {
    return NextResponse.json({ error: 'No tienes permiso para el análisis forestal' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const ids: unknown = body?.parcela_ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
    return NextResponse.json({ error: 'Falta parcela_ids' }, { status: 400 })
  }
  if (ids.length > MAX_POR_LOTE) {
    return NextResponse.json({ error: `Máximo ${MAX_POR_LOTE} parcelas por lote` }, { status: 400 })
  }

  const supabase = await createClient()
  // Polígonos en lon/lat (4326). RLS limita a la org del usuario.
  const { data: polys, error } = await supabase.rpc('get_parcela_polygons')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const idSet = new Set(ids as string[])
  const filas = ((polys ?? []) as { parcela_id: string; geojson: GeoJSON.Polygon }[]).filter((r) =>
    idSet.has(r.parcela_id),
  )

  // Códigos para el resultado.
  const { data: parc } = await supabase.from('parcelas').select('id, codigo_parcela').in('id', ids as string[])
  const codById = new Map((parc ?? []).map((p) => [p.id, p.codigo_parcela]))

  async function procesar(fila: (typeof filas)[number]): Promise<ResultadoParcela> {
    const codigo = codById.get(fila.parcela_id) ?? ''
    try {
      const ring = fila.geojson.coordinates[0] as [number, number][]
      const r = await analizarBosque2020(ring)
      const { error: e } = await supabase.from('parcela_eudr').upsert(
        {
          parcela_id: fila.parcela_id,
          org_id: session!.orgId,
          bosque2020_pct: r.pct,
          bosque2020_en: new Date().toISOString(),
        },
        { onConflict: 'parcela_id' },
      )
      if (e) throw new Error(e.message)
      return { parcela_id: fila.parcela_id, codigo, pct: r.pct, clase: claseBosque(r.pct), error: null }
    } catch (err) {
      return { parcela_id: fila.parcela_id, codigo, pct: null, clase: 'sin_traslape', error: err instanceof Error ? err.message : 'Error' }
    }
  }

  const resultados: ResultadoParcela[] = []
  for (let i = 0; i < filas.length; i += CONCURRENCIA) {
    resultados.push(...(await Promise.all(filas.slice(i, i + CONCURRENCIA).map(procesar))))
  }
  return NextResponse.json({ ok: true, resultados })
}
