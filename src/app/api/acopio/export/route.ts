// GET /api/acopio/export?desde&hasta&especie&tipo&estado&proveedor
// Descarga el acopio en Excel: Entradas, Pesadas y Resumen (§16).
import { getSessionResult } from '@/lib/session'
import { buildAcopioExport } from '@/lib/data/acopio-export'
import { buildXlsx } from '@/lib/xlsx.mjs'

export async function GET(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return new Response('No autenticado', { status: 401 })

  // Sólo Contabilidad (admin/contador) recibe las columnas de costo. La RLS de
  // entrada_costo lo respalda: aunque otro rol forzara el flag, saldría vacío.
  const incluirCosto = r.session.rol === 'admin' || r.session.rol === 'contador'

  const p = new URL(request.url).searchParams
  const { sheets } = await buildAcopioExport(
    {
      desde: p.get('desde'),
      hasta: p.get('hasta'),
      especie: p.get('especie'),
      tipo: p.get('tipo'),
      estado: p.get('estado'),
      proveedor: p.get('proveedor'),
    },
    incluirCosto,
  )

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
