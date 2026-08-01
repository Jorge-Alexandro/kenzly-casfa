// POST   /api/agroecologia/talleres/[id]/fotos      — sube evidencias (el anexo).
// DELETE /api/agroecologia/talleres/[id]/fotos?id=… — quita una foto.
//
// Las fotos llegan como data URL y se suben a Storage (bucket `geosic`, carpeta
// agro-talleres/{taller}/) — mismo patrón que las fotos de la boleta de acopio;
// en la fila sólo queda la URL pública, nunca el binario.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

function dataUrlABytes(dataUrl: string): { bytes: Uint8Array; ext: string; mime: string } | null {
  const m = /^data:(image\/(png|jpe?g));base64,(.+)$/i.exec(dataUrl)
  if (!m) return null
  const mime = m[1].toLowerCase()
  return { bytes: Buffer.from(m[3], 'base64'), ext: mime.includes('png') ? 'png' : 'jpg', mime }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const b = await request.json().catch(() => null)
  const fotos = Array.isArray(b?.fotos) ? b.fotos : []
  if (fotos.length === 0) return NextResponse.json({ error: 'No se mandó ninguna foto' }, { status: 400 })

  const supabase = await createClient()

  const { data: taller, error: tErr } = await supabase
    .from('agro_taller')
    .select('id, org_id')
    .eq('id', params.id)
    .maybeSingle()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 })
  if (!taller) return NextResponse.json({ error: 'Taller no encontrado' }, { status: 404 })

  const { data: existentes } = await supabase
    .from('agro_taller_foto')
    .select('orden')
    .eq('taller_id', params.id)
    .order('orden', { ascending: false })
    .limit(1)
  let siguienteOrden = (existentes?.[0]?.orden ?? -1) + 1

  const subidas: { url: string; descripcion: string | null; orden: number }[] = []
  for (const f of fotos) {
    const decoded = typeof f?.dataUrl === 'string' ? dataUrlABytes(f.dataUrl) : null
    if (!decoded) continue
    const path = `agro-talleres/${params.id}/${Date.now()}-${siguienteOrden}.${decoded.ext}`
    const { error: upErr } = await supabase.storage
      .from('geosic')
      .upload(path, decoded.bytes, { contentType: decoded.mime, upsert: true })
    if (upErr) return NextResponse.json({ error: `Subiendo foto: ${upErr.message}` }, { status: 400 })
    const { data: pub } = supabase.storage.from('geosic').getPublicUrl(path)
    subidas.push({ url: pub.publicUrl, descripcion: typeof f.descripcion === 'string' ? f.descripcion.trim() || null : null, orden: siguienteOrden })
    siguienteOrden++
  }
  if (subidas.length === 0) return NextResponse.json({ error: 'Ninguna imagen era válida (sólo png/jpg)' }, { status: 400 })

  const { data, error } = await supabase
    .from('agro_taller_foto')
    .insert(subidas.map((s) => ({ org_id: taller.org_id, taller_id: params.id, ...s })))
    .select('id, url, descripcion, orden')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, fotos: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta la foto' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('agro_taller_foto').delete().eq('id', id).eq('taller_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
