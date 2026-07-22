// POST /api/contratos/[id]/firmas — guarda las firmas electrónicas del contrato.
//
// Las firmas llegan como data URL (se dibujan en pantalla) y se suben a Storage
// (bucket `geosic`, carpeta contratos/{id}/); en la fila queda la URL pública.
// Sólo png/jpg: son los formatos que el generador del PDF sabe incrustar.
//
// Cuando las DOS partes firmaron, el contrato pasa a 'firmado' y se sella la
// fecha de cada firma. Body: { firma_vendedor?, firma_comprador? }  (data URL,
// o null para borrar una firma).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionResult } from '@/lib/session'

const CAMPOS: Record<string, { url: string; at: string }> = {
  firma_vendedor: { url: 'firma_vendedor_url', at: 'firmado_vendedor_at' },
  firma_comprador: { url: 'firma_comprador_url', at: 'firmado_comprador_at' },
}

function dataUrlABytes(dataUrl: string): { bytes: Uint8Array; ext: string; mime: string } | null {
  const m = /^data:(image\/(png|jpe?g));base64,(.+)$/i.exec(dataUrl)
  if (!m) return null
  const mime = m[1].toLowerCase()
  return { bytes: Buffer.from(m[3], 'base64'), ext: mime.includes('png') ? 'png' : 'jpg', mime }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const supabase = await createClient()

  const { data: contrato, error: cErr } = await supabase
    .from('contrato_fijacion')
    .select('id, estado, firma_vendedor_url, firma_comprador_url')
    .eq('id', params.id)
    .maybeSingle()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 })
  if (!contrato) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
  if (contrato.estado === 'cancelado') {
    return NextResponse.json({ error: 'El contrato está cancelado' }, { status: 409 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const ahora = new Date().toISOString()

  for (const [campo, cols] of Object.entries(CAMPOS)) {
    if (!(campo in body)) continue
    const valor = body[campo]

    if (!valor) {
      patch[cols.url] = null
      patch[cols.at] = null
      continue
    }
    if (typeof valor === 'string' && valor.startsWith('http')) continue // ya subida

    const img = typeof valor === 'string' ? dataUrlABytes(valor) : null
    if (!img) {
      return NextResponse.json({ error: `La firma ${campo} no es una imagen válida` }, { status: 400 })
    }

    const path = `contratos/${params.id}/${campo}-${Date.now()}.${img.ext}`
    const { error: upErr } = await supabase.storage
      .from('geosic')
      .upload(path, img.bytes, { contentType: img.mime, upsert: true })
    if (upErr) {
      return NextResponse.json({ error: `Subiendo ${campo}: ${upErr.message}` }, { status: 400 })
    }
    const { data: pub } = supabase.storage.from('geosic').getPublicUrl(path)
    patch[cols.url] = pub.publicUrl
    patch[cols.at] = ahora
  }

  // Con las dos firmas el contrato queda FIRMADO; si se borra una, vuelve a
  // 'emitido' (un contrato a medias no debe seguir contando como firmado).
  const vendedor = 'firma_vendedor_url' in patch ? patch.firma_vendedor_url : contrato.firma_vendedor_url
  const comprador = 'firma_comprador_url' in patch ? patch.firma_comprador_url : contrato.firma_comprador_url
  if (contrato.estado !== 'cumplido') {
    patch.estado = vendedor && comprador ? 'firmado' : contrato.estado === 'borrador' ? 'borrador' : 'emitido'
  }

  const { error } = await supabase.from('contrato_fijacion').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, estado: patch.estado ?? contrato.estado })
}
