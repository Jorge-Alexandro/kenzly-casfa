// "Costo de café" — reporte de obtención, salidas, ventas de segundas e
// inventario de maquila, reconstruido en vivo desde el módulo (mismas hojas que
// el entregable COSTO DE CAFE 2022.xlsx). Server-only; RLS acota por org.
//
// Reconciliación en SACOS: es la unidad común. `maquila_resultado` guarda lo
// OBTENIDO (sacos + kg); `maquila_salida` guarda lo VENDIDO (sacos + quintales).
// El inventario = obtenido − vendido en sacos.
//
// DOS LÍMITES conocidos de los datos (2026-07, confirmados con Jorge):
//  1. La venta de segunda NO guarda el subtipo (viene como 'SEGUNDA/ARABE'), así
//     que las ventas de segundas van AGREGADAS por Segunda/Tercera × especie, no
//     por subtipo. La OBTENCIÓN sí es por subtipo.
//  2. Los cortes cargados son PARCIALES (menos obtenido que vendido), así que el
//     inventario puede salir negativo. La hoja Inventario lo advierte.
import { createClient } from '@/lib/supabase/server'
import type { Sheet, CellValue } from '@/lib/xlsx.mjs'

// Cliente Supabase mínimo que necesita el reporte (permite inyectar service-role
// en pruebas). `any` acotado a .from().select() para no arrastrar los genéricos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any }

interface Maquila { id: string; numero: number | null; especie: string | null; tipo_proceso: string | null; fecha_corte: string | null }
interface Producto { id: string; clave: string; nombre: string; grupo: string }
interface Resultado { maquila_id: string; producto_id: string; sacos: number | null; total_kg: number | null }
interface Salida {
  fecha_salida: string | null; especie: string | null; clasificacion: string | null
  guia: string | null; folio: number | null; numero_lote: string | null
  destino: string | null; transporte: string | null; canal: string | null
  sacos: number | null; quintales: number | null; tipo_salida: string | null
}

const n = (v: number | null | undefined) => Number(v ?? 0)
const red = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d

/** Subtipos de "segunda" tal como los lista el entregable (incluye subproductos
 *  que en el catálogo caen en otros grupos, p.ej. caracol/granza). */
const SUBTIPOS_SEGUNDA = ['OLIVER', 'CLASIFICADORA', 'ELECTRONICA', 'CARACOL', 'GRANZA', 'ORO_NATURAL', 'PL']

export async function buildCostoCafe(
  db?: Db,
): Promise<{ sheets: Sheet[]; resumen: Record<string, number> }> {
  const supabase = db ?? (await createClient())
  const [mq, pr, re, sa] = await Promise.all([
    supabase.from('maquilas').select('id, numero, especie, tipo_proceso, fecha_corte').limit(2000),
    supabase.from('maquila_producto').select('id, clave, nombre, grupo').limit(200),
    supabase.from('maquila_resultado').select('maquila_id, producto_id, sacos, total_kg').limit(5000),
    supabase.from('maquila_salida').select(
      'fecha_salida, especie, clasificacion, guia, folio, numero_lote, destino, transporte, canal, sacos, quintales, tipo_salida',
    ).limit(5000),
  ])
  for (const r of [mq, pr, re, sa]) if (r.error) throw new Error(r.error.message)

  const maquilas = (mq.data ?? []) as unknown as Maquila[]
  const productos = (pr.data ?? []) as unknown as Producto[]
  const resultados = (re.data ?? []) as unknown as Resultado[]
  const salidas = (sa.data ?? []) as unknown as Salida[]

  const maqPorId = new Map(maquilas.map((m) => [m.id, m]))
  const prodPorId = new Map(productos.map((p) => [p.id, p]))

  // ── Hoja 1: Salidas de variedades (Oro Exportación) ───────────────────────
  const exp = salidas
    .filter((s) => s.clasificacion === 'EXP')
    .sort((a, b) => (a.fecha_salida ?? '').localeCompare(b.fecha_salida ?? ''))
  const hojaVariedades: CellValue[][] = [
    ['SALIDAS DE VARIEDADES — Oro de Exportación (remisiones)'],
    ['Fecha', 'Especie', 'Guía', 'Folio', 'Lote', 'Destino', 'Transporte / Canal', 'Sacos', 'Quintales'],
    ...exp.map((s) => [
      s.fecha_salida, especieBase(s.especie), s.guia, s.folio, s.numero_lote, s.destino,
      s.transporte ?? s.canal, n(s.sacos), red(n(s.quintales), 3),
    ]),
  ]
  totalesPorEspecie(hojaVariedades, exp)

  // ── Hoja 2: Obtención (formato largo: corte × producto) ───────────────────
  const hojaObtencion: CellValue[][] = [
    ['OBTENCIÓN POR CORTE (todas las variedades y subproductos)'],
    ['Corte', 'Fecha', 'Especie', 'Grupo', 'Producto', 'Sacos', 'Kilos'],
  ]
  const obtenidoPorProd = new Map<string, { sacos: number; kg: number }>()
  for (const r of resultados) {
    const m = maqPorId.get(r.maquila_id)
    const p = prodPorId.get(r.producto_id)
    if (!p) continue
    hojaObtencion.push([
      m?.numero ?? '—', m?.fecha_corte ?? '', especieBase(m?.especie), grupoLabel(p.grupo),
      p.nombre, n(r.sacos), red(n(r.total_kg), 2),
    ])
    const acc = obtenidoPorProd.get(p.clave) ?? { sacos: 0, kg: 0 }
    acc.sacos += n(r.sacos); acc.kg += n(r.total_kg)
    obtenidoPorProd.set(p.clave, acc)
  }
  // Totales por producto
  hojaObtencion.push([])
  hojaObtencion.push(['TOTAL OBTENIDO POR PRODUCTO'])
  hojaObtencion.push(['Producto', 'Grupo', 'Sacos', 'Kilos'])
  for (const p of productos.sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre))) {
    const acc = obtenidoPorProd.get(p.clave)
    if (!acc || (acc.sacos === 0 && acc.kg === 0)) continue
    hojaObtencion.push([p.nombre, grupoLabel(p.grupo), red(acc.sacos), red(acc.kg, 2)])
  }

  // ── Hoja 3: Ventas de segundas (agregado, sin subtipo) ────────────────────
  const nac = salidas
    .filter((s) => s.clasificacion === 'NACIONAL')
    .sort((a, b) => (a.fecha_salida ?? '').localeCompare(b.fecha_salida ?? ''))
  const hojaVentasSeg: CellValue[][] = [
    ['VENTAS DE SEGUNDAS Y TERCERAS (nacionales)'],
    ['La venta no guarda el subtipo (Oliver/Clasificadora/…): va agregada por clasificación y especie.'],
    ['Fecha', 'Clasificación', 'Especie', 'Folio', 'Canal', 'Destino', 'Sacos', 'Quintales'],
    ...nac.map((s) => [
      s.fecha_salida, clasificacionLabel(s.especie), especieBase(s.especie), s.folio,
      s.canal, s.destino, n(s.sacos), red(n(s.quintales), 3),
    ]),
  ]
  totalesVentasSegundas(hojaVentasSeg, nac)

  // ── Hoja 4: Inventario y resumen ──────────────────────────────────────────
  const oroExpObt = porEspecie(resultados, maqPorId, prodPorId, (p) => p.clave === 'ORO_EXPORTACION')
  const oroExpVen = ventasPorEspecie(exp)
  const segObt = sumaObtenido(resultados, prodPorId, (p) => SUBTIPOS_SEGUNDA.includes(p.clave))
  const segVen = sumaSalidas(nac, (s) => (s.especie ?? '').startsWith('SEGUNDA'))
  const terObt = sumaObtenido(resultados, prodPorId, (p) => p.grupo === 'terceras' && !SUBTIPOS_SEGUNDA.includes(p.clave))
  const terVen = sumaSalidas(nac, (s) => (s.especie ?? '').startsWith('TERCERA'))

  const hojaInv: CellValue[][] = [
    ['INVENTARIO — obtenido − vendido (en sacos)'],
    ['⚠ Los cortes cargados son PARCIALES: se vendió más de lo obtenido en el módulo,'],
    ['   por lo que el inventario puede salir NEGATIVO hasta cargar los cortes faltantes.'],
    [],
    ['Concepto', 'Obtenido sacos', 'Obtenido kg', 'Vendido sacos', 'Vendido qq', 'Inventario sacos'],
    filaInv('Oro Exportación — Árabe', oroExpObt.ARABE, oroExpVen.ARABE),
    filaInv('Oro Exportación — Robusta', oroExpObt.ROBUSTA, oroExpVen.ROBUSTA),
    filaInv('Segundas (Oliver, Clasificadora, Electrónica, Caracol, Granza, Oro natural, PL)', segObt, segVen),
    filaInv('Terceras (Cerezo, Repaso clasificadora)', terObt, terVen),
    [],
    ['RESUMEN GENERAL'],
    ['Total obtenido (sacos)', red(sumaTodoObtenido(resultados).sacos)],
    ['Total obtenido (kg)', red(sumaTodoObtenido(resultados).kg, 2)],
    ['Total exportado — sacos / qq', red(sumaSalidas(exp, () => true).sacos), red(sumaSalidas(exp, () => true).qq, 3)],
    ['Total ventas segundas y terceras — sacos / qq', red(sumaSalidas(nac, () => true).sacos), red(sumaSalidas(nac, () => true).qq, 3)],
    ['Cortes cargados', maquilas.length],
    ['Generado', new Date().toISOString().slice(0, 16).replace('T', ' ')],
  ]

  const resumen = {
    cortes: maquilas.length,
    obtenido_sacos: red(sumaTodoObtenido(resultados).sacos),
    exportado_sacos: red(sumaSalidas(exp, () => true).sacos),
    ventas_segundas_sacos: red(sumaSalidas(nac, () => true).sacos),
  }

  return {
    sheets: [
      { name: 'Salidas variedades', rows: hojaVariedades },
      { name: 'Obtención', rows: hojaObtencion },
      { name: 'Ventas segundas', rows: hojaVentasSeg },
      { name: 'Inventario', rows: hojaInv },
    ],
    resumen,
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
const especieBase = (e: string | null | undefined) => {
  const s = (e ?? '').toUpperCase()
  if (s.includes('ROBUSTA')) return 'ROBUSTA'
  if (s.includes('ARABE') || s.includes('ÁRABE')) return 'ARABE'
  return s || '—'
}
const clasificacionLabel = (e: string | null | undefined) => {
  const s = (e ?? '').toUpperCase()
  if (s.startsWith('TERCERA')) return 'Tercera'
  if (s.startsWith('SEGUNDA')) return 'Segunda'
  return '—'
}
const grupoLabel = (g: string) =>
  ({ primeras: 'Primeras', segundas: 'Segundas', terceras: 'Terceras', merma: 'Merma' }[g] ?? g)

function totalesPorEspecie(hoja: CellValue[][], filas: Salida[]) {
  const por = ventasPorEspecie(filas)
  hoja.push([])
  hoja.push(['TOTALES', '', '', '', '', '', '', 'Sacos', 'Quintales'])
  for (const esp of ['ARABE', 'ROBUSTA'] as const) {
    hoja.push([esp, '', '', '', '', '', '', red(por[esp].sacos), red(por[esp].qq, 3)])
  }
  hoja.push(['TOTAL', '', '', '', '', '', '', red(por.ARABE.sacos + por.ROBUSTA.sacos), red(por.ARABE.qq + por.ROBUSTA.qq, 3)])
}

function totalesVentasSegundas(hoja: CellValue[][], filas: Salida[]) {
  hoja.push([])
  hoja.push(['TOTALES', 'Clasificación', 'Especie', '', '', '', 'Sacos', 'Quintales'])
  const grupos = new Map<string, { sacos: number; qq: number }>()
  for (const s of filas) {
    const k = `${clasificacionLabel(s.especie)}|${especieBase(s.especie)}`
    const acc = grupos.get(k) ?? { sacos: 0, qq: 0 }
    acc.sacos += n(s.sacos); acc.qq += n(s.quintales)
    grupos.set(k, acc)
  }
  for (const [k, v] of Array.from(grupos.entries()).sort()) {
    const [clas, esp] = k.split('|')
    hoja.push(['', clas, esp, '', '', '', red(v.sacos), red(v.qq, 3)])
  }
  const tot = sumaSalidas(filas, () => true)
  hoja.push(['TOTAL', '', '', '', '', '', red(tot.sacos), red(tot.qq, 3)])
}

function ventasPorEspecie(filas: Salida[]) {
  const out = { ARABE: { sacos: 0, qq: 0 }, ROBUSTA: { sacos: 0, qq: 0 } }
  for (const s of filas) {
    const e = especieBase(s.especie)
    if (e === 'ARABE' || e === 'ROBUSTA') { out[e].sacos += n(s.sacos); out[e].qq += n(s.quintales) }
  }
  return out
}

function porEspecie(
  resultados: Resultado[], maqPorId: Map<string, Maquila>, prodPorId: Map<string, Producto>,
  filtro: (p: Producto) => boolean,
) {
  const out: Record<string, { sacos: number; kg: number }> = { ARABE: { sacos: 0, kg: 0 }, ROBUSTA: { sacos: 0, kg: 0 } }
  for (const r of resultados) {
    const p = prodPorId.get(r.producto_id)
    if (!p || !filtro(p)) continue
    const e = especieBase(maqPorId.get(r.maquila_id)?.especie)
    if (!out[e]) out[e] = { sacos: 0, kg: 0 }
    out[e].sacos += n(r.sacos); out[e].kg += n(r.total_kg)
  }
  return out
}

function sumaObtenido(resultados: Resultado[], prodPorId: Map<string, Producto>, filtro: (p: Producto) => boolean) {
  const acc = { sacos: 0, kg: 0 }
  for (const r of resultados) {
    const p = prodPorId.get(r.producto_id)
    if (p && filtro(p)) { acc.sacos += n(r.sacos); acc.kg += n(r.total_kg) }
  }
  return acc
}
const sumaTodoObtenido = (resultados: Resultado[]) =>
  resultados.reduce((a, r) => ({ sacos: a.sacos + n(r.sacos), kg: a.kg + n(r.total_kg) }), { sacos: 0, kg: 0 })

function sumaSalidas(filas: Salida[], filtro: (s: Salida) => boolean) {
  const acc = { sacos: 0, qq: 0 }
  for (const s of filas) if (filtro(s)) { acc.sacos += n(s.sacos); acc.qq += n(s.quintales) }
  return acc
}

function filaInv(
  concepto: string,
  obt: { sacos: number; kg: number },
  ven: { sacos: number; qq: number },
): CellValue[] {
  return [concepto, red(obt.sacos), red(obt.kg, 2), red(ven.sacos), red(ven.qq, 3), red(obt.sacos - ven.sacos)]
}
