// GET /api/lpa?ciclo=2025-2026 — genera y descarga el LPA (Excel) desde la base.
import { getSession } from '@/lib/session'
import { buildLpa } from '@/lib/data/lpa'
import { buildXlsx } from '@/lib/xlsx.mjs'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return new Response('No autenticado', { status: 401 })

  const ciclo = new URL(request.url).searchParams.get('ciclo')
  const { sheets, resumen } = await buildLpa(ciclo)
  const bytes = buildXlsx(sheets)

  const etiqueta = (resumen.ciclo ?? new Date().toISOString().slice(0, 10)).replace(/[^\w-]/g, '_')
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="LPA_${etiqueta}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
