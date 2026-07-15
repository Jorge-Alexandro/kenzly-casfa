// Generador del LPA — ensambla el entregable (padrón + certificación +
// estimación + bajas) desde la "buena base de datos". Server only.
import { createClient } from '@/lib/supabase/server'

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

const NIVEL_CORTO: Record<string, string> = {
  nuevo: 'NUEVO', t1: 'T1', t2: 'T2', t3: 'T3', organico: 'O',
}
const fdate = (v: unknown) => (v ? String(v).slice(0, 10) : null)

export async function buildLpa(ciclo?: string | null): Promise<{ sheets: Sheet[]; resumen: LpaResumen }> {
  const supabase = await createClient()

  const [{ data: prods }, { data: parc }, { data: cert }, { data: bajas }, { data: est }, { data: polig }, { data: reduc }] =
    await Promise.all([
      supabase.from('productores')
        .select('id, codigo, nombre_completo, comunidad, municipio, sexo, anio_ingreso, curp, ine')
        .order('codigo', { ascending: true }).limit(10000),
      supabase.from('parcelas')
        .select('id, productor_id, codigo_parcela, nombre, tipo_cultivo, superficie_declarada_ha,'
          + ' sic_inicio_conversion, sic_ultima_insp_interna, sic_ultima_insp_externa')
        .limit(20000),
      supabase.from('certificacion_estatus').select('productor_id, anio, nivel'),
      supabase.from('productor_baja').select('productor_id, tipo, fecha, motivo'),
      supabase.from('estimacion_cosecha').select('parcela_id, ciclo, cultivo, kg_estimado, qq_estimado, valor_final_kg'),
      // Coordenadas: centroide del polígono ACTIVO (la geometría de GeoSIC es la verdad).
      supabase.from('parcela_poligonos').select('parcela_id, centroide_lat, centroide_lng').eq('activo', true),
      supabase.from('reduccion_superficie')
        .select('productor_id, ciclo_anterior, ciclo_actual, ha_anterior, ha_actual, redujo'),
    ])

  const productores = (prods ?? []) as unknown as Record<string, unknown>[]
  const parcelas = (parc ?? []) as unknown as Record<string, unknown>[]
  const estimaciones = (est ?? []) as unknown as Record<string, unknown>[]

  // Años de certificación (columnas dinámicas) y ciclos de estimación.
  const certByProd = new Map<string, Record<number, string>>()
  const aniosSet = new Set<number>()
  for (const r of cert ?? []) {
    const pid = r.productor_id as string
    const anio = r.anio as number
    aniosSet.add(anio)
    if (!certByProd.has(pid)) certByProd.set(pid, {})
    certByProd.get(pid)![anio] = r.nivel as string
  }
  const anios = Array.from(aniosSet).sort((a, b) => a - b).slice(-5)

  const ciclos = Array.from(new Set(estimaciones.map((e) => e.ciclo as string))).sort()
  const cicloSel = ciclo ?? ciclos[ciclos.length - 1] ?? null

  // Estimación por parcela para el ciclo elegido: suma kg (final o estimado) y qq.
  const estByParcela = new Map<string, { kg: number; qq: number }>()
  for (const e of estimaciones) {
    if (cicloSel && e.ciclo !== cicloSel) continue
    const pid = e.parcela_id as string
    const acc = estByParcela.get(pid) ?? { kg: 0, qq: 0 }
    acc.kg += Number(e.valor_final_kg ?? e.kg_estimado ?? 0)
    acc.qq += Number(e.qq_estimado ?? 0)
    estByParcela.set(pid, acc)
  }

  const parcelasByProd = new Map<string, Record<string, unknown>[]>()
  for (const p of parcelas) {
    const pid = p.productor_id as string
    if (!parcelasByProd.has(pid)) parcelasByProd.set(pid, [])
    parcelasByProd.get(pid)!.push(p)
  }

  const bajaByProd = new Map<string, Record<string, unknown>>()
  for (const b of bajas ?? []) bajaByProd.set(b.productor_id as string, b)

  // Coordenadas por parcela (centroide del polígono activo).
  const coordByParcela = new Map<string, { lat: number; lng: number }>()
  for (const g of (polig ?? []) as Record<string, unknown>[]) {
    if (g.centroide_lat != null && g.centroide_lng != null) {
      coordByParcela.set(g.parcela_id as string, {
        lat: Number(g.centroide_lat), lng: Number(g.centroide_lng),
      })
    }
  }

  // --- Hoja LPA: una fila por parcela (productores activos) ------------------
  const header: Cell[] = [
    'N°', 'Código', 'Productor', 'Comunidad', 'Municipio', 'Sexo', 'Año ingreso', 'CURP', 'INE',
    ...anios.map((a) => `Certif ${a}`),
    'No. Parcela', 'Nombre Parcela', 'Cultivo', 'Superficie (ha)', 'Latitud', 'Longitud',
    'Inicio conversión', 'Últ. insp. interna', 'Últ. insp. externa',
    'Kg estimado', 'QQ estimado',
  ]
  const lpaRows: Cell[][] = [header]
  let n = 0
  for (const pr of productores) {
    const pid = pr.id as string
    if (bajaByProd.has(pid)) continue // los de baja van en su hoja
    n += 1
    const certRow = certByProd.get(pid) ?? {}
    const base: Cell[] = [
      n, pr.codigo as string, pr.nombre_completo as string,
      (pr.comunidad as string) ?? null, (pr.municipio as string) ?? null,
      (pr.sexo as string) ?? null, (pr.anio_ingreso as number) ?? null,
      (pr.curp as string) ?? null, (pr.ine as string) ?? null,
      ...anios.map((a) => NIVEL_CORTO[certRow[a]] ?? null),
    ]
    const pcs = parcelasByProd.get(pid) ?? []
    if (pcs.length === 0) {
      lpaRows.push([...base, ...Array(11).fill(null)]) // sin parcela
      continue
    }
    for (const p of pcs) {
      const e = estByParcela.get(p.id as string)
      const c = coordByParcela.get(p.id as string)
      lpaRows.push([
        ...base,
        (p.codigo_parcela as string) ?? null, (p.nombre as string) ?? null,
        (p.tipo_cultivo as string) ?? null,
        p.superficie_declarada_ha != null ? Number(p.superficie_declarada_ha) : null,
        c ? c.lat : null, c ? c.lng : null,
        fdate(p.sic_inicio_conversion), fdate(p.sic_ultima_insp_interna), fdate(p.sic_ultima_insp_externa),
        e ? Math.round(e.kg * 100) / 100 : null,
        e && e.qq ? Math.round(e.qq * 100) / 100 : null,
      ])
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
  for (const r of (reduc ?? []) as Record<string, unknown>[]) {
    redByProd.set(r.productor_id as string, r)
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
      r.ha_anterior != null ? Number(r.ha_anterior) : null,
      r.ha_actual != null ? Number(r.ha_actual) : null,
      r.redujo != null ? Number(r.redujo) : null,
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
