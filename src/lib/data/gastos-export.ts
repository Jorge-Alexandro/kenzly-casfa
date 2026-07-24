// Exportación de Gastos a Excel, en el MISMO formato del libro de Emily y
// Francisco: una hoja por programa con la matriz fecha × categoría y la columna
// TOTAL, más una hoja de detalle con los movimientos.
//
// Diferencia con su Excel: aquí la fila TOTAL y los totales por categoría los
// calcula el sistema, así que no pueden descuadrar.
import { getGastos, getProgramas, type FiltrosGasto } from '@/lib/data/gastos'
import { construirMatriz } from '@/lib/gastos/tipos'
import type { Sheet, CellValue } from '@/lib/xlsx.mjs'

const r2 = (n: number) => Math.round(n * 100) / 100

export async function buildGastosExport(f: FiltrosGasto): Promise<{
  sheets: Sheet[]
  resumen: { movimientos: number; total: number }
}> {
  const [programas, gastos] = await Promise.all([getProgramas(), getGastos(f)])

  const periodo =
    f.desde || f.hasta ? `${f.desde ?? '—'} a ${f.hasta ?? '—'}` : 'Todo el histórico'

  const sheets: Sheet[] = []
  let totalGeneral = 0

  // Si se filtró un programa, sólo va ese; si no, uno por cada uno.
  const visibles = f.programa ? programas.filter((p) => p.clave === f.programa) : programas

  for (const p of visibles) {
    const suyos = gastos.filter((g) => g.programa_id === p.id)
    const m = construirMatriz(suyos)
    totalGeneral += m.granTotal

    const cats = p.categorias
    const rows: CellValue[][] = [
      [`VIÁTICOS Y GASTOS DE ${p.nombre.toUpperCase()}`],
      ['Periodo', periodo],
      ['Movimientos', m.movimientos],
      [],
      ['FECHA', ...cats.map((c) => c.nombre.toUpperCase()), 'TOTAL'],
      ...m.filas.map((fila) => [
        fila.fecha,
        // Celda vacía cuando no hubo gasto de esa categoría ese día (como su Excel).
        ...cats.map((c) => fila.porCategoria[c.id] ?? null),
        r2(fila.total),
      ]),
      [
        'TOTAL',
        ...cats.map((c) => (m.totalPorCategoria[c.id] ? r2(m.totalPorCategoria[c.id]) : null)),
        r2(m.granTotal),
      ],
    ]
    sheets.push({ name: nombreHoja(p.nombre), rows })
  }

  // ── Detalle de movimientos ───────────────────────────────────────────────
  const nombrePrograma = new Map(programas.map((p) => [p.id, p.nombre]))
  const nombreCategoria = new Map(
    programas.flatMap((p) => p.categorias.map((c) => [c.id, c.nombre] as const)),
  )
  const detalle: CellValue[][] = [
    ['Fecha', 'Programa', 'Categoría', 'Monto', 'Concepto', 'Beneficiario', 'Comprobante'],
    ...gastos
      .filter((g) => visibles.some((p) => p.id === g.programa_id))
      .map((g) => [
        g.fecha,
        nombrePrograma.get(g.programa_id) ?? '—',
        nombreCategoria.get(g.categoria_id) ?? '—',
        r2(g.monto),
        g.concepto,
        g.beneficiario,
        g.comprobante,
      ]),
  ]
  sheets.push({ name: 'Movimientos', rows: detalle })

  return {
    sheets,
    resumen: { movimientos: gastos.length, total: r2(totalGeneral) },
  }
}

/** Excel no acepta : \ / ? * [ ] en el nombre de la hoja, y tope de 31. */
function nombreHoja(n: string) {
  return n.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31)
}
