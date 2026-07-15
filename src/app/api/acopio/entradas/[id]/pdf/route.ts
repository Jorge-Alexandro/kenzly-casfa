// GET /api/acopio/entradas/[id]/pdf — genera y DESCARGA el recibo como PDF real
// (Recibo_{folio}_{proveedor}.pdf). Vectorial, con @react-pdf/renderer.
import { readFile } from 'fs/promises'
import path from 'path'
import { renderToBuffer } from '@react-pdf/renderer'
import { getSession } from '@/lib/session'
import { getEntrada, getTaraConfig } from '@/lib/data/acopio'
import { ReciboPdf, type Imagenes } from '@/lib/acopio/ReciboPdf'

export const runtime = 'nodejs'

/** Descarga una imagen (Storage público) y la devuelve como data URI. */
async function bajar(url: string | null): Promise<string | undefined> {
  if (!url) return undefined
  // Si ya es un data URI (firma guardada inline), se usa tal cual.
  if (url.startsWith('data:image/')) return url
  try {
    const r = await fetch(url)
    if (!r.ok) return undefined
    const mime = r.headers.get('content-type') ?? 'image/png'
    if (!/image\/(png|jpe?g)/i.test(mime)) return undefined // react-pdf: sólo png/jpg
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

  const [entrada, tara] = await Promise.all([getEntrada(params.id), getTaraConfig()])
  if (!entrada) return new Response('Entrada no encontrada', { status: 404 })

  // Resolvemos todas las imágenes a Buffer antes de renderizar.
  const etiquetas: [string, string | null][] = [
    ['Foto análisis de calidad', entrada.foto_calidad_url],
    ['Foto muestra', entrada.foto_muestra_url],
    ['Foto de la libreta', entrada.foto_libreta_url],
    ['Foto de la libreta 2', entrada.foto_libreta2_url],
  ]
  const [logoIzq, logoDer, firmaReceptor, firmaProveedor, ...fotosBuf] = await Promise.all([
    logo('casfa.png'),
    logo('casfasa.png'),
    bajar(entrada.firma_receptor_url),
    bajar(entrada.firma_proveedor_url),
    ...etiquetas.map(([, url]) => bajar(url)),
  ])

  const img: Imagenes = {
    logoIzq,
    logoDer,
    firmaReceptor,
    firmaProveedor,
    fotos: etiquetas
      .map(([label], i) => ({ label, data: fotosBuf[i] }))
      .filter((f): f is { label: string; data: string } => !!f.data),
  }

  const pdf = await renderToBuffer(ReciboPdf({ entrada, tara, img }))

  const slug = entrada.proveedor_nombre.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40)
  const nombre = `Recibo_${entrada.folio}_${slug}.pdf`

  return new Response(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  })
}
