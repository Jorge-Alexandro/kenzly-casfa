// Gastos por programa — tipos puros (client-safe).
//
// El Excel de Emily y Francisco es una MATRIZ: fila = fecha, columna =
// categoría, y una columna TOTAL. Aquí se captura el movimiento suelto y la
// matriz se arma sola, así que los totales nunca descuadran.

export interface ProgramaGasto {
  id: string
  clave: string
  nombre: string
  orden: number
  categorias: CategoriaGasto[]
}

export interface CategoriaGasto {
  id: string
  nombre: string
  orden: number
  activo: boolean
}

export interface Gasto {
  id: string
  programa_id: string
  categoria_id: string
  fecha: string
  monto: number
  concepto: string | null
  beneficiario: string | null
  comprobante: string | null
}

/** Una fila de la matriz: la fecha y el monto por categoría. */
export interface FilaMatriz {
  fecha: string
  /** monto por categoria_id (sólo las que tienen algo ese día) */
  porCategoria: Record<string, number>
  total: number
  /** los movimientos que formaron la fila, para poder editarlos/borrarlos */
  movimientos: Gasto[]
}

export interface Matriz {
  filas: FilaMatriz[]
  /** total por categoria_id */
  totalPorCategoria: Record<string, number>
  granTotal: number
  movimientos: number
}

/**
 * Arma la matriz del Excel a partir de los movimientos: agrupa por fecha, suma
 * por categoría y saca los totales. Una fecha puede traer varios movimientos de
 * la misma categoría (en su Excel eso eran dos renglones el mismo día); aquí se
 * suman en la celda y el detalle queda en `movimientos`.
 */
export function construirMatriz(gastos: Gasto[]): Matriz {
  const porFecha = new Map<string, FilaMatriz>()
  const totalPorCategoria: Record<string, number> = {}
  let granTotal = 0

  for (const g of gastos) {
    const monto = Number(g.monto) || 0
    let fila = porFecha.get(g.fecha)
    if (!fila) {
      fila = { fecha: g.fecha, porCategoria: {}, total: 0, movimientos: [] }
      porFecha.set(g.fecha, fila)
    }
    fila.porCategoria[g.categoria_id] = round2((fila.porCategoria[g.categoria_id] ?? 0) + monto)
    fila.total = round2(fila.total + monto)
    fila.movimientos.push(g)
    totalPorCategoria[g.categoria_id] = round2((totalPorCategoria[g.categoria_id] ?? 0) + monto)
    granTotal = round2(granTotal + monto)
  }

  return {
    filas: Array.from(porFecha.values()).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    totalPorCategoria,
    granTotal,
    movimientos: gastos.length,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

export const fmtMXN = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Celda vacía en la matriz: en su Excel se dejaba en blanco, no en 0. */
export const fmtCelda = (n: number | undefined) =>
  n == null || n === 0 ? '' : fmtMXN(n)
