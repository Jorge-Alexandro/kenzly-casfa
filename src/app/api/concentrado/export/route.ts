// GET /api/concentrado/export?desde&hasta
// Descarga el concentrado de acopio: detalle de boletas, QQ acopiados por mes y
// tipo de café, y el reparto por cooperativa. Sólo Contabilidad (lleva importes).
import { getSessionResult } from '@/lib/session'
import { buildConcentradoExport } from '@/lib/data/concentrado-export'
import { buildXlsx } from '@/lib/xlsx.mjs'

export async function GET(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return new Response('No autenticado', { status: 401 })
  if (r.session.rol !== 'admin' && r.session.rol !== 'contador') {
    return new Response('Sólo Contabilidad puede exportar el concentrado.', { status: 403 })
  }

  const p = new URL(request.url).searchParams
  const { sheets } = await buildConcentradoExport({
    desde: p.get('desde'),
    hasta: p.get('hasta'),
  })

  const bytes = buildXlsx(sheets)
  const hoy = new Date().toISOString().slice(0, 10)

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Concentrado_acopio_${hoy}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
