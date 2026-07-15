// GET /api/acopio/export?desde&hasta&especie&tipo&estado&proveedor
// Descarga el acopio en Excel: Entradas, Pesadas y Resumen (§16).
import { getSession } from '@/lib/session'
import { buildAcopioExport } from '@/lib/data/acopio-export'
import { buildXlsx } from '@/lib/xlsx.mjs'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return new Response('No autenticado', { status: 401 })

  const p = new URL(request.url).searchParams
  const { sheets } = await buildAcopioExport({
    desde: p.get('desde'),
    hasta: p.get('hasta'),
    especie: p.get('especie'),
    tipo: p.get('tipo'),
    estado: p.get('estado'),
    proveedor: p.get('proveedor'),
  })

  const bytes = buildXlsx(sheets)
  const hoy = new Date().toISOString().slice(0, 10)

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Acopio_${hoy}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
