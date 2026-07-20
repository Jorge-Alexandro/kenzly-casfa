// GET /api/contratos/[id]/pdf — genera y DESCARGA el contrato como PDF real.
// Vectorial, con @react-pdf/renderer. El sello de CASFASA y las firmas se
// resuelven a data URI (react-pdf no acepta Buffer en <Image>).
import { readFile } from 'fs/promises'
import path from 'path'
import { renderToBuffer } from '@react-pdf/renderer'
import { getSession } from '@/lib/session'
import { getContrato, getConfig } from '@/lib/data/contratos'
import { ContratoPdf, type ContratoImagenes } from '@/lib/contratos/ContratoPdf'

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

  const [contrato, config] = await Promise.all([getContrato(params.id), getConfig()])
  if (!contrato) return new Response('Contrato no encontrado', { status: 404 })

  const [membrete, sello, firmaVendedor, firmaComprador] = await Promise.all([
    logo('casfasa.png'), // encabezado
    logo('sello.png'), // sello de aprobación
    bajar(contrato.firma_vendedor_url),
    bajar(contrato.firma_comprador_url ?? config?.firma_representante_url ?? null),
  ])

  const img: ContratoImagenes = { membrete, sello, firmaVendedor, firmaComprador }
  const pdf = await renderToBuffer(ContratoPdf({ contrato, config, img }))

  const slug = contrato.vendedor_nombre.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40)
  const nombre = `Contrato_${contrato.folio}_${slug}.pdf`

  return new Response(pdf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  })
}
