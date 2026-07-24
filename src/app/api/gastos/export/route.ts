// GET /api/gastos/export?programa&desde&hasta
// Descarga los gastos en Excel con la matriz por programa (el formato del libro
// de Emily y Francisco). Sólo Contabilidad.
import { getSessionResult } from '@/lib/session'
import { buildGastosExport } from '@/lib/data/gastos-export'
import { buildXlsx } from '@/lib/xlsx.mjs'

export async function GET(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return new Response('No autenticado', { status: 401 })
  if (r.session.rol !== 'admin' && r.session.rol !== 'contador') {
    return new Response('Sólo Contabilidad puede exportar gastos.', { status: 403 })
  }

  const p = new URL(request.url).searchParams
  const { sheets } = await buildGastosExport({
    programa: p.get('programa'),
    desde: p.get('desde'),
    hasta: p.get('hasta'),
  })

  const bytes = buildXlsx(sheets)
  const hoy = new Date().toISOString().slice(0, 10)
  const sufijo = p.get('programa') ? `_${p.get('programa')}` : ''

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Gastos${sufijo}_${hoy}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
