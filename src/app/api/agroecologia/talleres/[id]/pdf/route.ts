// GET /api/agroecologia/talleres/[id]/pdf — descarga el reporte como PDF real.
import { readFile } from 'fs/promises'
import path from 'path'
import { renderToBuffer } from '@react-pdf/renderer'
import { getSession } from '@/lib/session'
import { getTallerDetalle } from '@/lib/data/agro-talleres'
import { TallerPdf, type Imagenes } from '@/lib/agroecologia/TallerPdf'

export const runtime = 'nodejs'

async function bajar(url: string): Promise<string | undefined> {
  try {
    const r = await fetch(url)
    if (!r.ok) return undefined
    const mime = r.headers.get('content-type') ?? 'image/jpeg'
    if (!/image\/(png|jpe?g)/i.test(mime)) return undefined
    const b64 = Buffer.from(await r.arrayBuffer()).toString('base64')
    return `data:${mime};base64,${b64}`
  } catch {
    return undefined
  }
}

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

  const detalle = await getTallerDetalle(params.id)
  if (!detalle) return new Response('Taller no encontrado', { status: 404 })

  const [logoIzq, logoDer, ...fotosData] = await Promise.all([
    logo('casfa.png'),
    logo('casfasa.png'),
    ...detalle.fotos.map((f) => bajar(f.url)),
  ])

  const img: Imagenes = {
    logoIzq,
    logoDer,
    fotos: detalle.fotos.map((f, i) => ({ url: f.url, descripcion: f.descripcion, data: fotosData[i] })),
  }

  const pdf = await renderToBuffer(
    TallerPdf({
      taller: detalle.taller,
      plantilla: detalle.plantilla,
      tipoNombre: detalle.tipo_nombre,
      programaNombre: detalle.programa_nombre,
      asistentes: detalle.asistentes,
      img,
    }),
  )

  const slug = `${detalle.tipo_nombre}_${detalle.taller.comunidad}_${detalle.taller.fecha}`
    .replace(/[^\w-]/g, '_')
    .slice(0, 60)

  return new Response(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Taller_${slug}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
