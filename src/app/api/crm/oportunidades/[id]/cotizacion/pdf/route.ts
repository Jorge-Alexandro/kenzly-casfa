// GET /api/crm/oportunidades/[id]/cotizacion/pdf — descarga la cotización.
// Sirve para un cliente nuevo o "en general": no exige que la cuenta ya
// tenga RFC/cliente fiscal vinculado (eso pasa hasta que se gana el trato).
import { readFile } from 'fs/promises'
import path from 'path'
import { renderToBuffer } from '@react-pdf/renderer'
import { getSession } from '@/lib/session'
import { getOportunidadParaCotizacion } from '@/lib/data/crm'
import { CotizacionPdf, type Imagenes } from '@/lib/crm/CotizacionPdf'

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

  const cotizacion = await getOportunidadParaCotizacion(params.id)
  if (!cotizacion) return new Response('Oportunidad no encontrada', { status: 404 })

  const [logoIzq, logoDer] = await Promise.all([logo('casfa.png'), logo('casfasa.png')])
  const img: Imagenes = { logoIzq, logoDer }

  const pdf = await renderToBuffer(CotizacionPdf({ cotizacion, img }))

  const slug = `${cotizacion.id.slice(0, 8)}_${cotizacion.cuenta.nombre}`.replace(/[^\w-]/g, '_').slice(0, 60)

  return new Response(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Cotizacion_${slug}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
