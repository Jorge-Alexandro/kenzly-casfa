// GET /api/maquila/[id]/pdf — descarga el formato de corte como PDF real.
import { readFile } from 'fs/promises'
import path from 'path'
import { renderToBuffer } from '@react-pdf/renderer'
import { getSession } from '@/lib/session'
import { getMaquilaDetalle } from '@/lib/data/maquila'
import { CortePdf, type Imagenes } from '@/lib/maquila/CortePdf'

export const runtime = 'nodejs'

async function bajar(url: string | null): Promise<string | undefined> {
  if (!url) return undefined
  if (url.startsWith('data:image/')) return url
  try {
    const r = await fetch(url)
    if (!r.ok) return undefined
    const mime = r.headers.get('content-type') ?? 'image/png'
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

  const m = await getMaquilaDetalle(params.id)
  if (!m) return new Response('Corte no encontrado', { status: 404 })

  const [logoIzq, logoDer, firmaElaboro, firmaEntrego, firmaRetrillero, firmaCalador] = await Promise.all([
    logo('casfa.png'),
    logo('casfasa.png'),
    bajar(m.firma_elaboro_url),
    bajar(m.firma_entrego_url),
    bajar(m.firma_retrillero_url),
    bajar(m.firma_calador_url),
  ])

  const img: Imagenes = { logoIzq, logoDer, firmaElaboro, firmaEntrego, firmaRetrillero, firmaCalador }
  const pdf = await renderToBuffer(CortePdf({ m, img }))
  const nombre = `Maquila_${m.clave.replace(/[^\w-]/g, '_')}.pdf`

  return new Response(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  })
}
