// §16 — Exportación de Acopio a Excel: Entradas, Pesadas y Resumen.
// Server-only. RLS acota por organización; los filtros vienen del querystring.
import { createClient } from '@/lib/supabase/server'
import { ESTADO_ENTRADA_LABEL, type EstadoEntrada } from '@/lib/acopio/tipos'
import type { Sheet, CellValue } from '@/lib/xlsx.mjs'

export interface FiltrosAcopio {
  desde?: string | null // fecha_acopio >=
  hasta?: string | null // fecha_acopio <=
  especie?: string | null
  tipo?: string | null
  estado?: string | null
  proveedor?: string | null // coincidencia parcial en el nombre
}

interface EntradaExport {
  id: string
  folio: number
  fecha_acopio: string
  proveedor_nombre: string
  comunidad: string | null
  municipio: string | null
  especie: string
  tipo: string
  total_sacos: number
  plastico: number
  yute: number
  henequen: number
  kg_brutos: number
  tara_kg: number
  kg_netos: number
  quintales: number | null
  rendimiento: number | null
  zaranda_16: number | null
  zaranda_15: number | null
  caracol: number | null
  mancha: number | null
  humedad: number | null
  cosecha: string | null
  comentarios: string | null
  estado: EstadoEntrada
}

interface PesadaExport {
  entrada_id: string
  numero_pesada: number
  m1_sacos: number
  m1_kgs: number
  m2_sacos: number
  m2_kgs: number
  plastico: number
  yute: number
  henequen: number
  sacos_total: number
  kg_brutos: number
  tara_kg: number
  kg_netos: number
  quintales: number | null
}

/** Los % se guardan como fracción (0.8013). En el Excel van en puntos (80.13). */
const pct = (v: number | null) => (v == null ? null : redondear(v * 100, 2))
const redondear = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d
const num = (v: number | null | undefined) => Number(v ?? 0)

export async function buildAcopioExport(
  f: FiltrosAcopio,
  incluirCosto = false,
): Promise<{
  sheets: Sheet[]
  resumen: { entradas: number; pesadas: number; kg_netos: number }
}> {
  const supabase = await createClient()

  let q = supabase
    .from('entradas')
    .select(
      'id, folio, fecha_acopio, proveedor_nombre, comunidad, municipio, especie, tipo,' +
        ' total_sacos, plastico, yute, henequen, kg_brutos, tara_kg, kg_netos, quintales,' +
        ' rendimiento, zaranda_16, zaranda_15, caracol, mancha, humedad, cosecha,' +
        ' comentarios, estado',
    )
    .order('folio', { ascending: true })
    .limit(5000)

  if (f.desde) q = q.gte('fecha_acopio', f.desde)
  if (f.hasta) q = q.lte('fecha_acopio', f.hasta)
  if (f.especie) q = q.eq('especie', f.especie)
  if (f.tipo) q = q.eq('tipo', f.tipo)
  if (f.estado) q = q.eq('estado', f.estado)
  if (f.proveedor) q = q.ilike('proveedor_nombre', `%${f.proveedor}%`)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const entradas = (data ?? []) as unknown as EntradaExport[]

  // Pesadas de esas entradas, por lotes (el `in` no aguanta miles de ids en la URL).
  const pesadas: PesadaExport[] = []
  const ids = entradas.map((e) => e.id)
  for (let i = 0; i < ids.length; i += 100) {
    const { data: p, error: pErr } = await supabase
      .from('pesadas')
      .select(
        'entrada_id, numero_pesada, m1_sacos, m1_kgs, m2_sacos, m2_kgs, plastico,' +
          ' yute, henequen, sacos_total, kg_brutos, tara_kg, kg_netos, quintales',
      )
      .in('entrada_id', ids.slice(i, i + 100))
      .order('numero_pesada', { ascending: true })
    if (pErr) throw new Error(pErr.message)
    pesadas.push(...((p ?? []) as unknown as PesadaExport[]))
  }

  const porEntrada = new Map(entradas.map((e) => [e.id, e]))
  const numPesadas = new Map<string, number>()
  for (const p of pesadas) numPesadas.set(p.entrada_id, (numPesadas.get(p.entrada_id) ?? 0) + 1)

  // Costo por boleta (sólo Contabilidad). La RLS de entrada_costo devuelve filas
  // únicamente si el que exporta es admin/contador; para el resto ni se pide.
  const costoPorEntrada = new Map<string, { precio_kg: number | null; importe: number | null; pagado: number }>()
  if (incluirCosto) {
    for (let i = 0; i < ids.length; i += 100) {
      const { data: c } = await supabase
        .from('entrada_costo')
        .select('entrada_id, precio_kg, importe, importe_pagado')
        .in('entrada_id', ids.slice(i, i + 100))
      for (const r of c ?? []) {
        costoPorEntrada.set(r.entrada_id as string, {
          precio_kg: r.precio_kg == null ? null : Number(r.precio_kg),
          importe: r.importe == null ? null : Number(r.importe),
          pagado: r.importe_pagado == null ? 0 : Number(r.importe_pagado),
        })
      }
    }
  }
  const costoCols = incluirCosto ? ['Precio/kg', 'Importe', 'Importe pagado', 'Saldo'] : []
  const costoDe = (id: string): CellValue[] => {
    if (!incluirCosto) return []
    const c = costoPorEntrada.get(id)
    if (!c) return [null, null, null, null]
    const saldo = c.importe == null ? null : redondear(c.importe - c.pagado, 2)
    return [c.precio_kg, c.importe, c.pagado, saldo]
  }

  // ── Hoja 1: Entradas ──────────────────────────────────────────────────────
  const hojaEntradas: CellValue[][] = [
    [
      'Folio', 'Fecha', 'Proveedor', 'Comunidad', 'Municipio', 'Especie', 'Tipo',
      'Pesadas', 'Sacos', 'Plástico', 'Yute', 'Henequén',
      'Kg brutos', 'Tara (kg)', 'Kg netos', 'Quintales',
      'Rendimiento %', 'Zaranda 16 %', 'Zaranda 15 %', 'Caracol %', 'Mancha %', 'Humedad %',
      'Cosecha', 'Estado', 'Comentarios', ...costoCols,
    ],
    ...entradas.map((e) => [
      e.folio, e.fecha_acopio, e.proveedor_nombre, e.comunidad, e.municipio, e.especie, e.tipo,
      numPesadas.get(e.id) ?? 0, e.total_sacos, e.plastico, e.yute, e.henequen,
      num(e.kg_brutos), num(e.tara_kg), num(e.kg_netos), e.quintales,
      pct(e.rendimiento), pct(e.zaranda_16), pct(e.zaranda_15), pct(e.caracol),
      pct(e.mancha), pct(e.humedad),
      e.cosecha, ESTADO_ENTRADA_LABEL[e.estado] ?? e.estado, e.comentarios, ...costoDe(e.id),
    ]),
  ]

  // ── Hoja 2: Pesadas (ligadas por folio) ───────────────────────────────────
  const hojaPesadas: CellValue[][] = [
    [
      'Folio', 'Fecha', 'Proveedor', 'Especie', 'Tipo', '# Pesada',
      'Máq 1 sacos', 'Máq 1 kgs', 'Máq 2 sacos', 'Máq 2 kgs',
      'Plástico', 'Yute', 'Henequén',
      'Sacos', 'Kg brutos', 'Tara (kg)', 'Kg netos', 'Quintales',
    ],
    ...pesadas
      .map((p) => {
        const e = porEntrada.get(p.entrada_id)
        return { p, e }
      })
      .filter((x): x is { p: PesadaExport; e: EntradaExport } => Boolean(x.e))
      .sort((a, b) => a.e.folio - b.e.folio || a.p.numero_pesada - b.p.numero_pesada)
      .map(({ p, e }) => [
        e.folio, e.fecha_acopio, e.proveedor_nombre, e.especie, e.tipo, p.numero_pesada,
        p.m1_sacos, num(p.m1_kgs), p.m2_sacos, num(p.m2_kgs),
        p.plastico, p.yute, p.henequen,
        p.sacos_total, num(p.kg_brutos), num(p.tara_kg), num(p.kg_netos), p.quintales,
      ]),
  ]

  // ── Hoja 3: Resumen ───────────────────────────────────────────────────────
  const total = acumular(entradas)
  const filtros = [
    f.desde || f.hasta ? `Fechas: ${f.desde ?? '—'} a ${f.hasta ?? '—'}` : null,
    f.especie ? `Especie: ${f.especie}` : null,
    f.tipo ? `Tipo: ${f.tipo}` : null,
    f.estado ? `Estado: ${ESTADO_ENTRADA_LABEL[f.estado as EstadoEntrada] ?? f.estado}` : null,
    f.proveedor ? `Proveedor: ${f.proveedor}` : null,
  ].filter(Boolean) as string[]

  const hojaResumen: CellValue[][] = [
    ['RESUMEN DE ACOPIO'],
    ['Generado', new Date().toISOString().slice(0, 16).replace('T', ' ')],
    ['Filtros', filtros.length ? filtros.join(' · ') : 'Sin filtros (todo el acopio)'],
    [],
    ['TOTALES'],
    ['Entradas', entradas.length],
    ['Pesadas', pesadas.length],
    ['Sacos', total.sacos],
    ['Kg brutos', redondear(total.kg_brutos, 2)],
    ['Tara (kg)', redondear(total.tara_kg, 2)],
    ['Kg netos', redondear(total.kg_netos, 2)],
    ['Quintales', redondear(total.quintales, 3)],
    [],
    ['POR ESPECIE Y TIPO'],
    ['Especie', 'Tipo', 'Entradas', 'Sacos', 'Kg netos', 'Quintales'],
    ...grupos(entradas, (e) => `${e.especie}||${e.tipo}`).map(([k, g]) => {
      const [especie, tipo] = k.split('||')
      const a = acumular(g)
      return [especie, tipo, g.length, a.sacos, redondear(a.kg_netos, 2), redondear(a.quintales, 3)]
    }),
    [],
    ['POR ESTADO'],
    ['Estado', 'Entradas', 'Kg netos'],
    ...grupos(entradas, (e) => e.estado).map(([k, g]) => [
      ESTADO_ENTRADA_LABEL[k as EstadoEntrada] ?? k,
      g.length,
      redondear(acumular(g).kg_netos, 2),
    ]),
    [],
    ['POR PROVEEDOR'],
    ['Proveedor', 'Comunidad', 'Entradas', 'Sacos', 'Kg netos', 'Quintales'],
    ...grupos(entradas, (e) => e.proveedor_nombre)
      .map(([k, g]) => {
        const a = acumular(g)
        return [k, g[0].comunidad, g.length, a.sacos, redondear(a.kg_netos, 2), redondear(a.quintales, 3)] as CellValue[]
      })
      .sort((a, b) => Number(b[4] ?? 0) - Number(a[4] ?? 0)),
  ]

  return {
    sheets: [
      { name: 'Entradas', rows: hojaEntradas },
      { name: 'Pesadas', rows: hojaPesadas },
      { name: 'Resumen', rows: hojaResumen },
    ],
    resumen: {
      entradas: entradas.length,
      pesadas: pesadas.length,
      kg_netos: redondear(total.kg_netos, 2),
    },
  }
}

function acumular(es: EntradaExport[]) {
  return es.reduce(
    (a, e) => ({
      sacos: a.sacos + num(e.total_sacos),
      kg_brutos: a.kg_brutos + num(e.kg_brutos),
      tara_kg: a.tara_kg + num(e.tara_kg),
      kg_netos: a.kg_netos + num(e.kg_netos),
      quintales: a.quintales + num(e.quintales),
    }),
    { sacos: 0, kg_brutos: 0, tara_kg: 0, kg_netos: 0, quintales: 0 },
  )
}

function grupos(es: EntradaExport[], clave: (e: EntradaExport) => string): [string, EntradaExport[]][] {
  const m = new Map<string, EntradaExport[]>()
  for (const e of es) {
    const k = clave(e)
    const g = m.get(k)
    if (g) g.push(e)
    else m.set(k, [e])
  }
  return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'))
}
