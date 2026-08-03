// GET /api/ventas/requisiciones/[id]/pdf — descarga la requisición.
import { readFile } from 'fs/promises'
import path from 'path'
import { renderToBuffer } from '@react-pdf/renderer'
import { getSession } from '@/lib/session'
import { getRequisicionDetalle } from '@/lib/data/ventas'
import { RequisicionPdf, type Imagenes } from '@/lib/ventas/RequisicionPdf'

export const runtime = 'nodejs'

async function logo(nombre: string): Promise<string | undefined> {
  try {
    const buf = await readFile(path.join(process.cwd(), 'public', 'logos', nombre))
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return undefined
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return new Response('No autenticado', { status: 401 })

  const requisicion = await getRequisicionDetalle(params.id)
  if (!requisicion) return new Response('Requisición no encontrada', { status: 404 })

  const [logoIzq, logoDer] = await Promise.all([logo('casfa.png'), logo('casfasa.png')])
  const img: Imagenes = { logoIzq, logoDer }

  const pdf = await renderToBuffer(RequisicionPdf({ requisicion, img }))

  return new Response(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Requisicion_${String(requisicion.folio).padStart(4, '0')}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
