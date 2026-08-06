// Generador del LPA — ensambla el entregable (padrón + certificación +
// estimación + bajas) desde la "buena base de datos".
//
// CASFA entrega a MAYACERT 3 LPA SEPARADOS, no un solo archivo: el padrón de
// Café Robusta (código de productor "CR...") tiene sus propias columnas de
// producción, el de Café General ("MX..." con parcelas tipo_cultivo=cafe)
// otras, y el de Cultivos Tropicales ("MX..." con parcelas tipo_cultivo=
// tropical) columnas por cultivo (cacao/coco/mango/plátano/canela/marañón).
// Mezclarlos en un solo archivo es lo que hacía que "no se parecieran" a lo
// que el cliente manda hoy a mano. Server only.
import { createClient } from '@/lib/supabase/server'
import { codigoCorto } from '@/lib/format'

type Cell = string | number | null

export interface Sheet {
  name: string
  rows: Cell[][]
}
export interface LpaResumen {
  productores: number
  parcelas: number
  bajas: number
  reducciones: number
  anios: number[]
  ciclos: string[]
  ciclo: string | null
}

export type GrupoLpa = 'robusta' | 'general' | 'tropicales'

export const GRUPOS_LPA: { id: GrupoLpa; nombre: string; descripcion: string }[] = [
  { id: 'robusta', nombre: 'Café Robusta', descripcion: 'Productores con código CR — producción de café robusta (y arábica donde aplique).' },
  { id: 'general', nombre: 'Café General', descripcion: 'Productores con código MX y parcelas de café (mayormente arábica).' },
  { id: 'tropicales', nombre: 'Cultivos Tropicales', descripcion: 'Productores con código MX y parcelas de cacao, coco, mango, plátano, canela o marañón.' },
]

const CULTIVOS_TROPICALES: { clave: string; etiqueta: string }[] = [
  { clave: 'cacao', etiqueta: 'Cacao' },
  { clave: 'coco', etiqueta: 'Coco' },
  { clave: 'mango_ataulfo', etiqueta: 'Mango Ataulfo' },
  { clave: 'platano_macho', etiqueta: 'Plátano' },
  { clave: 'canela', etiqueta: 'Canela' },
  { clave: 'maranon', etiqueta: 'Marañón' },
]

const NIVEL_CORTO: Record<string, string> = {
  nuevo: 'NUEVO', t1: 'T1', t2: 'T2', t3: 'T3', organico: 'O',
}
const fdate = (v: unknown) => (v ? String(v).slice(0, 10) : null)
const num = (v: unknown) => (v != null ? Number(v) : null)
const round2 = (v: number) => Math.round(v * 100) / 100

/** ¿A qué LPA pertenece este productor? Código CR = Robusta; MX se separa por tipo_productor. */
function grupoDeProductor(pr: Record<string, unknown>): GrupoLpa {
  const codigo = String(pr.codigo ?? '').toUpperCase()
  if (codigo.startsWith('CR')) return 'robusta'
  return pr.tipo_productor === 'tropical' ? 'tropicales' : 'general'
}

async function cargarDatos() {
  const supabase = await createClient()
  const [{ data: prods }, { data: parc }, { data: pcafe }, { data: ptrop }, { data: cert }, { data: bajas }, { data: est }, { data: polig }, { data: reduc }] =
    await Promise.all([
      supabase.from('productores')
        .select('id, codigo, nombre_completo, comunidad, municipio, sexo, anio_ingreso, curp, ine, tipo_productor')
        .order('codigo', { ascending: true }).limit(10000),
      supabase.from('parcelas')
        .select('id, productor_id, codigo_parcela, nombre, tipo_cultivo, superficie_declarada_ha,'
          + ' sic_inicio_conversion, sic_ultima_insp_interna, sic_ultima_insp_externa')
        .limit(20000),
      supabase.from('parcela_cafe')
        .select('parcela_id, superficie_arabica_ha, superficie_robusta_ha,'
          + ' arabe_produccion_qq, arabe_rendimiento_kg_ha, robusta_produccion_qq, robusta_rendimiento_kg_ha'),
      supabase.from('parcela_tropical').select('parcela_id, cultivos'),
      supabase.from('certificacion_estatus').select('productor_id, anio, nivel'),
      supabase.from('productor_baja').select('productor_id, tipo, fecha, motivo'),
      supabase.from('estimacion_cosecha').select('parcela_id, ciclo, cultivo, kg_estimado, qq_estimado, valor_final_kg'),
      // Coordenadas: centroide del polígono ACTIVO (la geometría de GeoSIC es la verdad).
      supabase.from('parcela_poligonos').select('parcela_id, centroide_lat, centroide_lng').eq('activo', true),
      supabase.from('reduccion_superficie')
        .select('productor_id, ciclo_anterior, ciclo_actual, ha_anterior, ha_actual, redujo'),
    ])

  return {
    productores: (prods ?? []) as unknown as Record<string, unknown>[],
    parcelas: (parc ?? []) as unknown as Record<string, unknown>[],
    parcelaCafe: (pcafe ?? []) as unknown as Record<string, unknown>[],
    parcelaTropical: (ptrop ?? []) as unknown as Record<string, unknown>[],
    cert: (cert ?? []) as unknown as Record<string, unknown>[],
    bajas: (bajas ?? []) as unknown as Record<string, unknown>[],
    estimaciones: (est ?? []) as unknown as Record<string, unknown>[],
    poligonos: (polig ?? []) as unknown as Record<string, unknown>[],
    reduc: (reduc ?? []) as unknown as Record<string, unknown>[],
  }
}

type Datos = Awaited<ReturnType<typeof cargarDatos>>

function ensamblarGrupo(grupo: GrupoLpa, datos: Datos, cicloParam?: string | null): { sheets: Sheet[]; resumen: LpaResumen } {
  const productores = datos.productores.filter((pr) => grupoDeProductor(pr) === grupo)
  const idsProductores = new Set(productores.map((p) => p.id as string))
  const tipoEsperado = grupo === 'tropicales' ? 'tropical' : 'cafe'
  const parcelas = datos.parcelas.filter((p) => idsProductores.has(p.productor_id as string) && p.tipo_cultivo === tipoEsperado)

  const certByProd = new Map<string, Record<number, string>>()
  const aniosSet = new Set<number>()
  for (const r of datos.cert) {
    const pid = r.productor_id as string
    if (!idsProductores.has(pid)) continue
    const anio = r.anio as number
    aniosSet.add(anio)
    if (!certByProd.has(pid)) certByProd.set(pid, {})
    certByProd.get(pid)![anio] = r.nivel as string
  }
  const anios = Array.from(aniosSet).sort((a, b) => a - b).slice(-5)

  const ciclos = Array.from(new Set(datos.estimaciones.map((e) => e.ciclo as string))).sort()
  const cicloSel = cicloParam ?? ciclos[ciclos.length - 1] ?? null

  // Estimación por parcela+cultivo para el ciclo elegido (cafe_arabe / cafe_robusta).
  const estByParcelaCultivo = new Map<string, { kg: number; qq: number }>()
  for (const e of datos.estimaciones) {
    if (cicloSel && e.ciclo !== cicloSel) continue
    const key = `${e.parcela_id}::${e.cultivo}`
    const acc = estByParcelaCultivo.get(key) ?? { kg: 0, qq: 0 }
    acc.kg += Number(e.valor_final_kg ?? e.kg_estimado ?? 0)
    acc.qq += Number(e.qq_estimado ?? 0)
    estByParcelaCultivo.set(key, acc)
  }

  const pcafeByParcela = new Map<string, Record<string, unknown>>()
  for (const r of datos.parcelaCafe) pcafeByParcela.set(r.parcela_id as string, r)
  type CultivoTropical = { cultivo: string; arboles: number | null; prod_kg: number | null; tm: number | null }
  const ptropByParcela = new Map<string, CultivoTropical[]>()
  for (const r of datos.parcelaTropical) {
    ptropByParcela.set(r.parcela_id as string, ((r.cultivos as CultivoTropical[] | null) ?? []))
  }

  const parcelasByProd = new Map<string, Record<string, unknown>[]>()
  for (const p of parcelas) {
    const pid = p.productor_id as string
    if (!parcelasByProd.has(pid)) parcelasByProd.set(pid, [])
    parcelasByProd.get(pid)!.push(p)
  }

  const bajaByProd = new Map<string, Record<string, unknown>>()
  for (const b of datos.bajas) {
    if (idsProductores.has(b.productor_id as string)) bajaByProd.set(b.productor_id as string, b)
  }

  const coordByParcela = new Map<string, { lat: number; lng: number }>()
  for (const g of datos.poligonos) {
    if (g.centroide_lat != null && g.centroide_lng != null) {
      coordByParcela.set(g.parcela_id as string, { lat: Number(g.centroide_lat), lng: Number(g.centroide_lng) })
    }
  }

  // --- Hoja LPA: una fila por parcela (productores activos) ------------------
  const comunes: Cell[] = [
    'N°', 'Código', 'Productor', 'Comunidad', 'Municipio', 'Sexo', 'Año ingreso', 'CURP', 'INE',
    ...anios.map((a) => `Certif ${a}`),
    'No. Parcela', 'Nombre Parcela', 'Superficie (ha)', 'Latitud', 'Longitud',
  ]
  const cola: Cell[] = ['Inicio conversión', 'Últ. insp. interna', 'Últ. insp. externa']

  const header: Cell[] = grupo === 'tropicales'
    ? [...comunes, ...CULTIVOS_TROPICALES.flatMap((c) => [`${c.etiqueta} (árboles)`, `${c.etiqueta} (kg)`, `${c.etiqueta} (TM)`]), ...cola]
    : [...comunes, 'Sup. Arábica (ha)', 'Sup. Robusta (ha)',
        'QQ Arábica', 'Kg Arábica', 'Rend. Arábica (kg/ha)',
        'QQ Robusta', 'Kg Robusta', 'Rend. Robusta (kg/ha)', ...cola]

  const lpaRows: Cell[][] = [header]
  let n = 0
  for (const pr of productores) {
    const pid = pr.id as string
    if (bajaByProd.has(pid)) continue // los de baja van en su hoja
    const pcs = parcelasByProd.get(pid) ?? []
    if (pcs.length === 0) continue // sin parcela de este cultivo: no aplica a este LPA
    n += 1
    const certRow = certByProd.get(pid) ?? {}
    const base: Cell[] = [
      n, pr.codigo as string, pr.nombre_completo as string,
      (pr.comunidad as string) ?? null, (pr.municipio as string) ?? null,
      (pr.sexo as string) ?? null, (pr.anio_ingreso as number) ?? null,
      (pr.curp as string) ?? null, (pr.ine as string) ?? null,
      ...anios.map((a) => NIVEL_CORTO[certRow[a]] ?? null),
    ]
    for (const p of pcs) {
      const pidParc = p.id as string
      const c = coordByParcela.get(pidParc)
      const colaVals: Cell[] = [
        fdate(p.sic_inicio_conversion), fdate(p.sic_ultima_insp_interna), fdate(p.sic_ultima_insp_externa),
      ]
      const filaBase: Cell[] = [
        ...base,
        codigoCorto((p.codigo_parcela as string) ?? '', (p.nombre as string) ?? null) || null,
        (p.nombre as string) ?? null,
        p.superficie_declarada_ha != null ? Number(p.superficie_declarada_ha) : null,
        c ? c.lat : null, c ? c.lng : null,
      ]

      if (grupo === 'tropicales') {
        const cultivosParcela = ptropByParcela.get(pidParc) ?? []
        const porClave = new Map(cultivosParcela.map((cv) => [cv.cultivo, cv]))
        const bloque = CULTIVOS_TROPICALES.flatMap(({ clave }) => {
          const cv = porClave.get(clave)
          return [
            cv?.arboles != null ? Number(cv.arboles) : null,
            cv?.prod_kg != null ? Number(cv.prod_kg) : null,
            cv?.tm != null ? Number(cv.tm) : null,
          ]
        })
        lpaRows.push([...filaBase, ...bloque, ...colaVals])
      } else {
        const pc = pcafeByParcela.get(pidParc)
        const estArabe = estByParcelaCultivo.get(`${pidParc}::cafe_arabe`)
        const estRobusta = estByParcelaCultivo.get(`${pidParc}::cafe_robusta`)
        const qqArabe = estArabe?.qq ?? num(pc?.arabe_produccion_qq)
        const qqRobusta = estRobusta?.qq ?? num(pc?.robusta_produccion_qq)
        lpaRows.push([
          ...filaBase,
          num(pc?.superficie_arabica_ha), num(pc?.superficie_robusta_ha),
          qqArabe != null ? round2(qqArabe) : null,
          estArabe?.kg != null ? round2(estArabe.kg) : null,
          num(pc?.arabe_rendimiento_kg_ha),
          qqRobusta != null ? round2(qqRobusta) : null,
          estRobusta?.kg != null ? round2(estRobusta.kg) : null,
          num(pc?.robusta_rendimiento_kg_ha),
          ...colaVals,
        ])
      }
    }
  }

  // --- Hoja BAJAS ------------------------------------------------------------
  const bajaRows: Cell[][] = [['N°', 'Código', 'Productor', 'Comunidad', 'Municipio', 'Tipo', 'Fecha', 'Motivo']]
  let nb = 0
  for (const pr of productores) {
    const b = bajaByProd.get(pr.id as string)
    if (!b) continue
    nb += 1
    bajaRows.push([
      nb, pr.codigo as string, pr.nombre_completo as string,
      (pr.comunidad as string) ?? null, (pr.municipio as string) ?? null,
      b.tipo as string, fdate(b.fecha), (b.motivo as string) ?? null,
    ])
  }

  // --- Hoja Reducción de Superficie -----------------------------------------
  const redByProd = new Map<string, Record<string, unknown>>()
  for (const r of datos.reduc) {
    if (idsProductores.has(r.productor_id as string)) redByProd.set(r.productor_id as string, r)
  }
  const redRows: Cell[][] = [
    ['N°', 'Código', 'Productor', 'Comunidad', 'Municipio', 'Ha anterior', 'Ha actual', 'Redujo (ha)'],
  ]
  let nr = 0
  for (const pr of productores) {
    const r = redByProd.get(pr.id as string)
    if (!r) continue
    nr += 1
    redRows.push([
      nr, pr.codigo as string, pr.nombre_completo as string,
      (pr.comunidad as string) ?? null, (pr.municipio as string) ?? null,
      num(r.ha_anterior), num(r.ha_actual), num(r.redujo),
    ])
  }

  const resumen: LpaResumen = {
    productores: n,
    parcelas: lpaRows.length - 1,
    bajas: nb,
    reducciones: nr,
    anios,
    ciclos,
    ciclo: cicloSel,
  }
  return {
    sheets: [
      { name: 'LPA', rows: lpaRows },
      { name: 'BAJAS', rows: bajaRows },
      { name: 'Reducción de Superficie', rows: redRows },
    ],
    resumen,
  }
}

export async function buildLpaGrupo(grupo: GrupoLpa, ciclo?: string | null): Promise<{ sheets: Sheet[]; resumen: LpaResumen }> {
  const datos = await cargarDatos()
  return ensamblarGrupo(grupo, datos, ciclo)
}

/** Los 3 LPA de una sola pasada a la BD — para el resumen de la pantalla. */
export async function buildLpaTodos(ciclo?: string | null): Promise<Record<GrupoLpa, { sheets: Sheet[]; resumen: LpaResumen }>> {
  const datos = await cargarDatos()
  return {
    robusta: ensamblarGrupo('robusta', datos, ciclo),
    general: ensamblarGrupo('general', datos, ciclo),
    tropicales: ensamblarGrupo('tropicales', datos, ciclo),
  }
}
