// Lógica compartida por POST /api/fichas (alta) y PATCH /api/fichas/[id]
// (edición). Ambas rutas tienen que validar las parcelas y recalcular la
// estimación exactamente igual: si vive en un solo lugar no se desincronizan.
import type { SupabaseClient } from '@supabase/supabase-js'
import { estimarCafe, estimarCacao, CACAO_IM_DEFAULT } from '@/lib/agroecologia/estimacion.mjs'
import { aGeoJSON, huellaPuntos, leerPuntos } from '@/lib/geo/puntos'

export const TIPOS = ['robusta', 'arabe', 'tropicales']
export const ESTADOS_PERMITIDOS = ['borrador', 'en_revision']

/** Temporada estilo "2025-2026" desde la fecha (corte en septiembre). */
export function temporadaDe(fecha: string | null): string {
  const d = fecha ? new Date(fecha) : new Date()
  const y = d.getFullYear()
  return d.getMonth() + 1 >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

/**
 * Valida que las parcelas sean del productor (vía RLS + filtro) y devuelve la
 * superficie total. Nunca se confía en un área mandada por el cliente.
 */
export async function validarParcelas(
  supabase: SupabaseClient,
  productorId: string,
  parcelaIds: string[],
): Promise<{ areaHa: number } | { error: string }> {
  const { data, error } = await supabase
    .from('parcelas')
    .select('id, superficie_declarada_ha')
    .eq('productor_id', productorId)
    .in('id', parcelaIds)

  if (error) return { error: error.message }
  if (!data || data.length !== parcelaIds.length) {
    return { error: 'Alguna parcela no pertenece al productor seleccionado' }
  }
  return {
    areaHa: data.reduce((s, p) => s + (Number(p.superficie_declarada_ha) || 0), 0),
  }
}

/**
 * Fuente única de la estimación: si la ficha capturó una, se escribe también en
 * estimacion_cosecha (la tabla que alimenta el LPA). El servidor RECALCULA con
 * el motor — el kg del cliente es solo referencia visual. Best-effort: un fallo
 * aquí no debe tumbar el guardado de la ficha.
 */
export async function sincronizarEstimacion(
  supabase: SupabaseClient,
  opts: {
    orgId: string
    fichaId: string
    tipo: string
    productorId: string
    parcelaIds: string[]
    fechaInspeccion: string | null
    respuestas: Record<string, unknown>
    userId: string
  },
) {
  const { respuestas } = opts
  const metodo = respuestas['est_metodo'] as string | undefined
  const promedio = Number(respuestas['est_promedio']) || 0
  if (!metodo || promedio <= 0) return

  const esCacao = metodo === 'Cacao'
  const pa = Number(respuestas['est_plantas_arboles']) || 0
  const superficie = Number(respuestas['est_superficie_ha']) || null

  let factor_im: number
  let kg: number | null
  let qq: number | null
  if (esCacao) {
    const r = estimarCacao({ promedio_mazorcas: promedio, n_arboles: pa }, {})
    factor_im = CACAO_IM_DEFAULT
    kg = r.kg_seco
    qq = null
  } else {
    const r = estimarCafe(
      { promedio_cerezo_bandola: promedio, plantas_ha: pa, superficie_ha: superficie ?? undefined },
      { kgPorQuintal: opts.tipo === 'arabe' ? 57.5 : 80 },
    )
    factor_im = r.factor
    kg = r.kg ?? null
    qq = r.qq ?? r.qq_ha ?? null
  }

  const cultivo = esCacao ? 'cacao' : opts.tipo === 'arabe' ? 'cafe_arabe' : 'cafe_robusta'
  const { error } = await supabase.from('estimacion_cosecha').upsert(
    {
      org_id: opts.orgId,
      parcela_id: opts.parcelaIds[0],
      productor_id: opts.productorId,
      ciclo: temporadaDe(opts.fechaInspeccion),
      cultivo,
      metodo: esCacao ? 'cacao' : 'cafe',
      muestra: { origen: 'ficha', ficha_id: opts.fichaId, promedio, plantas_arboles: pa },
      promedio,
      factor_o_im: factor_im,
      plantas_ha: esCacao ? null : pa,
      n_arboles: esCacao ? pa : null,
      superficie_ha: superficie,
      kg_estimado: kg,
      qq_estimado: qq,
      rendimiento_kg_ha: kg && superficie ? Math.round((kg / superficie) * 100) / 100 : null,
      valor_final_kg: kg,
      inspector_id: opts.userId,
      fecha: opts.fechaInspeccion || null,
    },
    { onConflict: 'parcela_id,ciclo,cultivo' },
  )
  if (error) console.error('[fichas] estimacion_cosecha upsert:', error.message)
}

/**
 * Convierte los puntos GPS caminados en la ficha en el polígono de la parcela.
 *
 * Usa el mismo RPC que GeoSIC (upsert_parcela_poligono), así que el polígono
 * levantado a pie entra por la misma puerta que un KML: se versiona, PostGIS
 * recalcula área/perímetro/centroide y el estado de validación sale solo.
 *
 * La huella de los puntos queda en motivo_cambio para no crear una versión
 * nueva cada vez que se reguarda la misma ficha sin haber caminado nada — si
 * no, corregir una falta de ortografía generaría una versión del polígono.
 *
 * Best-effort: un fallo aquí no debe tumbar el guardado de la ficha.
 */
export async function sincronizarPoligonos(
  supabase: SupabaseClient,
  opts: {
    fichaId: string
    parcelaIds: string[]
    respuestas: Record<string, unknown>
  },
): Promise<{ creados: number }> {
  let creados = 0

  for (const parcelaId of opts.parcelaIds) {
    const puntos = leerPuntos(opts.respuestas, parcelaId)
    const geojson = aGeoJSON(puntos)
    if (!geojson) continue // menos de 3 puntos: no hay polígono que armar

    const sello = `Ficha ${opts.fichaId.slice(0, 8)} · ${puntos.length} puntos GPS · ${huellaPuntos(puntos)}`

    // ¿El polígono activo ya salió de estos mismos puntos?
    const { data: activo } = await supabase
      .from('parcela_poligonos')
      .select('id, motivo_cambio')
      .eq('parcela_id', parcelaId)
      .eq('activo', true)
      .maybeSingle()
    if (activo?.motivo_cambio === sello) continue

    const { error } = await supabase.rpc('upsert_parcela_poligono', {
      p_parcela_id: parcelaId,
      p_geojson: geojson,
      p_archivo_url: null,
      p_es_kmz: false,
      p_metodo: 'gps',
    })
    if (error) {
      console.error('[fichas] upsert_parcela_poligono:', error.message)
      continue
    }

    // El RPC no recibe el motivo: se sella la versión recién creada.
    await supabase
      .from('parcela_poligonos')
      .update({ motivo_cambio: sello })
      .eq('parcela_id', parcelaId)
      .eq('activo', true)

    creados++
  }

  return { creados }
}
