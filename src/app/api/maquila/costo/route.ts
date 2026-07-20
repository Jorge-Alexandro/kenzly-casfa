// GET /api/maquila/costo — descarga el reporte "Costo de café" en Excel:
// salidas de variedades, obtención, ventas de segundas e inventario.
import { getSession } from '@/lib/session'
import { buildCostoCafe } from '@/lib/data/maquila-costo'
import { buildXlsx } from '@/lib/xlsx.mjs'

export async function GET() {
  const session = await getSession()
  if (!session) return new Response('No autenticado', { status: 401 })

  const { sheets } = await buildCostoCafe()
  const bytes = buildXlsx(sheets)
  const hoy = new Date().toISOString().slice(0, 10)

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Costo_de_cafe_${hoy}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
