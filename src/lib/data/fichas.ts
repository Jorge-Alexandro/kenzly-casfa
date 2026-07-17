// Server-side data access for the Fichas module (Modulo 3).
import { createClient } from '@/lib/supabase/server'
import type {
  FormTemplate,
  FormSeccion,
  FormCampo,
  ProductorLite,
  ParcelaLite,
  FichaListRow,
} from '@/lib/types'

// All active form templates for the org, fully nested (secciones -> campos).
export async function getFormTemplates(): Promise<FormTemplate[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('form_templates')
    .select(
      `id, tipo_cultivo, nombre, version,
       form_secciones ( id, nombre, orden,
         form_campos ( id, nombre_interno, etiqueta, tipo, opciones, requerido, orden, imagen_referencia_url, config )
       )`,
    )
    .eq('activo', true)

  if (error) throw new Error(`getFormTemplates: ${error.message}`)

  // Sort secciones and campos by orden (PostgREST nested order isn't guaranteed).
  return (data ?? []).map((t) => ({
    id: t.id,
    tipo_cultivo: t.tipo_cultivo,
    nombre: t.nombre,
    version: t.version,
    secciones: (t.form_secciones ?? [])
      .map(
        (s): FormSeccion => ({
          id: s.id,
          nombre: s.nombre,
          orden: s.orden,
          campos: (s.form_campos ?? [])
            .map(
              (c): FormCampo => ({
                id: c.id,
                nombre_interno: c.nombre_interno,
                etiqueta: c.etiqueta,
                tipo: c.tipo,
                opciones: c.opciones,
                requerido: c.requerido,
                orden: c.orden,
                imagen_referencia_url: c.imagen_referencia_url ?? null,
                config: (c.config ?? {}) as FormCampo['config'],
              }),
            )
            .sort((a, b) => a.orden - b.orden),
        }),
      )
      .sort((a, b) => a.orden - b.orden),
  }))
}

// Lite catalogs for the capture selectors.
export async function getProductoresLite(): Promise<ProductorLite[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('productores')
    .select('id, codigo, nombre_completo, tipo_productor, comunidad, municipio')
    .order('nombre_completo')
  if (error) throw new Error(`getProductoresLite: ${error.message}`)

  // Estatus de certificación vigente por productor: el nivel del año más
  // reciente. Se anexa al catálogo para mostrarlo arriba de la ficha (y offline).
  const { data: est } = await supabase
    .from('certificacion_estatus')
    .select('productor_id, anio, nivel')
    .order('anio', { ascending: false })
  const nivelPorProd = new Map<string, { nivel: string; anio: number }>()
  for (const e of est ?? []) {
    const pid = e.productor_id as string
    if (!nivelPorProd.has(pid)) {
      nivelPorProd.set(pid, { nivel: e.nivel as string, anio: e.anio as number })
    }
  }

  // Plantas entregadas en Agroecología, por productor (para verificar en campo).
  const { data: entregas } = await supabase
    .from('agro_entrega_planta')
    .select('productor_id, anio, especie, cantidad')
    .order('anio', { ascending: false })
  const plantasPorProd = new Map<string, { anio: number; especie: string; cantidad: number }[]>()
  for (const e of entregas ?? []) {
    const pid = e.productor_id as string
    const arr = plantasPorProd.get(pid) ?? []
    arr.push({ anio: e.anio as number, especie: e.especie as string, cantidad: e.cantidad as number })
    plantasPorProd.set(pid, arr)
  }

  return (data ?? []).map((p) => {
    const e = nivelPorProd.get(p.id)
    return {
      ...p,
      estatus_nivel: (e?.nivel ?? null) as ProductorLite['estatus_nivel'],
      estatus_anio: e?.anio ?? null,
      plantas_entregadas: plantasPorProd.get(p.id) ?? [],
    }
  }) as ProductorLite[]
}

export async function getParcelasLite(): Promise<ParcelaLite[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('parcelas')
    .select(
      `id, productor_id, codigo_parcela, nombre, tipo_cultivo, superficie_declarada_ha,
       parcela_cafe ( superficie_arabica_ha, superficie_robusta_ha, robusta_produccion_qq, arabe_produccion_qq )`,
    )
    .order('codigo_parcela')
  if (error) throw new Error(`getParcelasLite: ${error.message}`)

  return (data ?? []).map((p) => {
    const cafe = Array.isArray(p.parcela_cafe) ? p.parcela_cafe[0] : p.parcela_cafe
    const supCafe =
      (Number(cafe?.superficie_arabica_ha) || 0) +
      (Number(cafe?.superficie_robusta_ha) || 0)
    const prod =
      cafe?.robusta_produccion_qq ?? cafe?.arabe_produccion_qq ?? null
    return {
      id: p.id,
      productor_id: p.productor_id,
      codigo_parcela: p.codigo_parcela,
      nombre: p.nombre,
      tipo_cultivo: p.tipo_cultivo,
      superficie_declarada_ha: p.superficie_declarada_ha,
      cafe_superficie_ha: supCafe > 0 ? supCafe : null,
      cafe_produccion_qq: prod,
    }
  })
}

// Full ficha detail for the view/print page.
export async function getFichaDetalle(
  fichaId: string,
): Promise<import('@/lib/types').FichaDetalle | null> {
  const supabase = await createClient()

  const { data: ficha, error: fErr } = await supabase
    .from('fichas')
    .select(
      `id, tipo, estado, fecha_inspeccion, area_cultivada_ha, resultado_evaluacion,
       created_at, respuestas, template_id, inspector_id,
       productores ( nombre_completo, codigo, comunidad, municipio ),
       ficha_parcelas ( parcelas ( id, codigo_parcela, nombre, superficie_declarada_ha ) )`,
    )
    .eq('id', fichaId)
    .maybeSingle()

  if (fErr) throw new Error(`getFichaDetalle: ${fErr.message}`)
  if (!ficha) return null

  const prod = Array.isArray(ficha.productores)
    ? ficha.productores[0]
    : ficha.productores

  // Inspector name (RLS only exposes the current user's row; falls back to null).
  let inspectorNombre: string | null = null
  if (ficha.inspector_id) {
    const { data: insp } = await supabase
      .from('usuarios')
      .select('nombre, email')
      .eq('id', ficha.inspector_id)
      .maybeSingle()
    inspectorNombre = insp?.nombre ?? insp?.email ?? null
  }

  // Template (secciones/campos) to render answers grouped & labeled.
  let template: FormTemplate | null = null
  if (ficha.template_id) {
    const all = await getFormTemplates()
    template = all.find((t) => t.id === ficha.template_id) ?? null
  }

  const parcelas = (ficha.ficha_parcelas ?? [])
    .map((fp) => (Array.isArray(fp.parcelas) ? fp.parcelas[0] : fp.parcelas))
    .filter(Boolean) as {
    id: string
    codigo_parcela: string
    nombre: string | null
    superficie_declarada_ha: number | null
  }[]

  // Bitácora vinculada (anexo) a esta ficha, si existe.
  const { data: bita } = await supabase
    .from('bitacora_anual')
    .select('id, parcela_id, anio, datos')
    .eq('ficha_id', ficha.id)
    .maybeSingle()

  return {
    ficha: {
      id: ficha.id,
      tipo: ficha.tipo,
      estado: ficha.estado,
      fecha_inspeccion: ficha.fecha_inspeccion,
      area_cultivada_ha: ficha.area_cultivada_ha,
      resultado_evaluacion: ficha.resultado_evaluacion,
      created_at: ficha.created_at,
      respuestas: ficha.respuestas ?? {},
    },
    productor: {
      nombre_completo: prod?.nombre_completo ?? '—',
      codigo: prod?.codigo ?? '',
      comunidad: prod?.comunidad ?? null,
      municipio: prod?.municipio ?? null,
    },
    inspector_nombre: inspectorNombre,
    parcelas,
    template,
    bitacora: bita
      ? { id: bita.id, parcela_id: bita.parcela_id, anio: bita.anio, datos: bita.datos }
      : null,
  }
}

// Fichas list with productor name + parcela count.
export async function getFichas(): Promise<FichaListRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('fichas')
    .select(
      `id, tipo, estado, fecha_inspeccion, area_cultivada_ha, created_at,
       productores ( nombre_completo, codigo ),
       ficha_parcelas ( id )`,
    )
    .order('created_at', { ascending: false })

  if (error) throw new Error(`getFichas: ${error.message}`)

  return (data ?? []).map((f) => {
    const prod = Array.isArray(f.productores) ? f.productores[0] : f.productores
    return {
      id: f.id,
      tipo: f.tipo,
      estado: f.estado,
      fecha_inspeccion: f.fecha_inspeccion,
      productor_nombre: prod?.nombre_completo ?? '—',
      productor_codigo: prod?.codigo ?? '',
      num_parcelas: (f.ficha_parcelas ?? []).length,
      area_cultivada_ha: f.area_cultivada_ha,
      created_at: f.created_at,
    }
  })
}
