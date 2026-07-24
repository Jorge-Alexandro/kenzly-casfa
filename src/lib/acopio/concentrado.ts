// Concentrado de acopio (el reporte de Francisco) — piezas puras, client-safe.
//
// El acopio se captura por ESPECIE + TIPO (ARABE/PERGAMINO, ROBUSTA/CEREZO…),
// pero contabilidad y comercialización lo nombran distinto: "ARABE PERGAMINO",
// "ORO EXPORTACION", "ROBUSTA EN BOLA". Aquí vive esa traducción, para que el
// reporte salga con los nombres que ellos usan sin cambiar cómo se acopia.

/** Un lote de exportación son 418.40 quintales. */
export const LOTE_QQ = 418.4

export const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
] as const

/** Nombre comercial a partir de especie + tipo. */
export function nombreComercial(especie: string, tipo: string): string {
  const k = `${especie}|${tipo}`.toUpperCase()
  switch (k) {
    case 'ARABE|PERGAMINO': return 'ARABE PERGAMINO'
    case 'ARABE|ORO': return 'ORO EXPORTACION'
    case 'ROBUSTA|CEREZO': return 'ROBUSTA EN BOLA'
    case 'ROBUSTA|ORO': return 'ROBUSTA ORO'
    case 'CACAO|FERMENTADO':
    case 'CACAO|LAVADO': return 'CACAO'
    default: return `${especie} ${tipo}`.trim().toUpperCase()
  }
}

/**
 * El CACAO no lleva quintal (no hay factor de conversión: se acopia y se vende
 * en kilos). Se reporta aparte, en kilos, y NUNCA suma quintales — si no, los
 * kilos de cacao se colarían como si fueran quintales de café e inflarían el
 * acopio y el reparto por cooperativa.
 */
export const llevaQuintal = (especie: string) => especie.toUpperCase() !== 'CACAO'

/** Mes en texto a partir de una fecha ISO (2026-04-30 → ABRIL). */
export function mesDe(fechaISO: string): string {
  const m = Number(fechaISO?.slice(5, 7))
  return MESES[m - 1] ?? fechaISO?.slice(0, 7) ?? '—'
}

/** Quintales convertidos a lotes de exportación. */
export const enLotes = (qq: number) => Math.round((qq / LOTE_QQ) * 10000) / 10000

export const fmtMXN = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const fmtNum = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : Number(n).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d })

// ── Formas del reporte ──────────────────────────────────────────────────────

export interface CeldaAcopio {
  kg: number
  qq: number
  importe: number
  boletas: number
}

export interface FilaMes {
  mes: string
  porTipo: Record<string, CeldaAcopio>
  total: CeldaAcopio
}

export interface QQAcopiados {
  tipos: string[]          // columnas (sin cacao)
  filas: FilaMes[]
  totalPorTipo: Record<string, CeldaAcopio>
  total: CeldaAcopio
  /** El cacao va aparte: sólo kilos. */
  cacao: { kg: number; boletas: number; importe: number }
}

export interface FilaCooperativa {
  nombre: string
  esSociedad: boolean
  boletas: number
  kg: number
  qq: number
  lotes: number
  importe: number
}

export interface ReparteCooperativas {
  sociedades: FilaCooperativa[]
  individuales: FilaCooperativa
  total: FilaCooperativa
}

export const celdaVacia = (): CeldaAcopio => ({ kg: 0, qq: 0, importe: 0, boletas: 0 })

export function acumular(c: CeldaAcopio, kg: number, qq: number, importe: number) {
  c.kg = round2(c.kg + kg)
  c.qq = round4(c.qq + qq)
  c.importe = round2(c.importe + importe)
  c.boletas++
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000
