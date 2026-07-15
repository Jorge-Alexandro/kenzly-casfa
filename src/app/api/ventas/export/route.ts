// GET /api/ventas/export?anio=2026&mes=4 — "Exportar Planilla": CSV UTF-8 con
// BOM (compatible Excel) con la matriz producto × mes del reporte, espejo del
// Excel "Reporte de Ventas Producto Terminado". Columnas por mes en el orden
// del spec (Ene_Cantidad, Ene_Importe, …) — los 12 meses, no solo Ene–Abr,
// para que el mismo endpoint sirva todo el año. Fila TOTALES al final.
// mes solo nombra el archivo: CASFASA_Ventas_{MES}_{AÑO}.csv
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDetalles, agregarPorProductoMes } from '@/lib/data/ventas'
import { MESES, MESES_LARGO } from '@/lib/ventas/tipos'

export const dynamic = 'force-dynamic'

function campoCsv(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const params = new URL(request.url).searchParams
  const hoy = new Date()
  const anio = Number(params.get('anio')) || hoy.getFullYear()
  const detalles = await getDetalles(anio)

  // Mes del reporte para el nombre del archivo: el pedido o el último con datos.
  let mes = Number(params.get('mes'))
  if (!mes || mes < 1 || mes > 12) {
    const ultimo = detalles.reduce((max, d) => Math.max(max, Number(d.fecha.slice(5, 7))), 1)
    mes = ultimo
  }

  const filas = agregarPorProductoMes(detalles)

  const encabezado = [
    'ID_Producto',
    'Nombre_Producto',
    'Linea_Negocio',
    ...MESES.flatMap((m) => [`${m}_Cantidad`, `${m}_Importe`]),
    'Total_Cantidad',
    'Total_Importe',
    'KG_Materia_Prima',
    'Precio_Promedio_Venta',
  ]

  const red2 = (n: number) => Math.round(n * 100) / 100
  const cuerpo = filas.map((f) => {
    const kg = red2(f.total_cantidad * (f as { kg_por_unidad?: number }).kg_por_unidad!)
    const promedio = f.total_cantidad > 0 ? red2(f.total_importe / f.total_cantidad) : 0
    return [
      f.producto_id,
      f.nombre,
      f.linea,
      ...f.cantidad_mes.flatMap((c, i) => [red2(c), red2(f.importe_mes[i])]),
      red2(f.total_cantidad),
      red2(f.total_importe),
      kg,
      promedio,
    ]
  })

  // Fila TOTALES.
  const totCant = filas.reduce((a, f) => a + f.total_cantidad, 0)
  const totImp = filas.reduce((a, f) => a + f.total_importe, 0)
  const totKg = cuerpo.reduce((a, fila) => a + Number(fila[fila.length - 2]), 0)
  const totales = [
    '',
    'TOTALES',
    '',
    ...MESES.flatMap((_, i) => [
      red2(filas.reduce((a, f) => a + f.cantidad_mes[i], 0)),
      red2(filas.reduce((a, f) => a + f.importe_mes[i], 0)),
    ]),
    red2(totCant),
    red2(totImp),
    red2(totKg),
    totCant > 0 ? red2(totImp / totCant) : 0,
  ]

  const csv =
    '﻿' + // BOM UTF-8 para que Excel abra acentos bien
    [encabezado, ...cuerpo, totales].map((fila) => fila.map(campoCsv).join(',')).join('\r\n')

  const nombre = `CASFASA_Ventas_${MESES_LARGO[mes - 1].toUpperCase()}_${anio}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}"`,
    },
  })
}
