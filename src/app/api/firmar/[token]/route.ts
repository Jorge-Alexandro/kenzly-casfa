// POST /api/firmar/[token] — el vendedor firma el contrato desde la liga remota.
//
// PÚBLICA: no hay sesión. El acceso lo da el token (capacidad no adivinable) y
// sólo permite UNA cosa — estampar la firma del vendedor en ESE contrato. Usa
// la llave de servicio para escribir, nunca expuesta al cliente.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function dataUrlABytes(dataUrl: string): { bytes: Uint8Array; ext: string; mime: string } | null {
  const m = /^data:(image\/(png|jpe?g));base64,(.+)$/i.exec(dataUrl)
  if (!m) return null
  const mime = m[1].toLowerCase()
  return { bytes: Buffer.from(m[3], 'base64'), ext: mime.includes('png') ? 'png' : 'jpg', mime }
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const body = await request.json().catch(() => null)
  const firma = body?.firma
  if (typeof firma !== 'string' || !firma) {
    return NextResponse.json({ error: 'Falta la firma' }, { status: 400 })
  }
  const img = dataUrlABytes(firma)
  if (!img) return NextResponse.json({ error: 'La firma no es una imagen válida' }, { status: 400 })

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: c } = await db
    .from('contrato_fijacion')
    .select('id, estado, firma_comprador_url')
    .eq('firma_token', params.token)
    .maybeSingle()
  if (!c) return NextResponse.json({ error: 'Liga no válida o vencida' }, { status: 404 })
  if (c.estado === 'cancelado') {
    return NextResponse.json({ error: 'El contrato está cancelado' }, { status: 409 })
  }

  const filePath = `contratos/${c.id}/firma_vendedor-${Date.now()}.${img.ext}`
  const { error: upErr } = await db.storage
    .from('geosic')
    .upload(filePath, img.bytes, { contentType: img.mime, upsert: true })
  if (upErr) return NextResponse.json({ error: `Subiendo la firma: ${upErr.message}` }, { status: 400 })
  const { data: pub } = db.storage.from('geosic').getPublicUrl(filePath)

  const ahora = new Date().toISOString()
  // Con la firma del vendedor + la del comprador ya presente, el contrato queda
  // firmado. Si aún falta la de CASFA, se queda como estaba (emitido/borrador).
  const estado = c.firma_comprador_url && c.estado !== 'cumplido' ? 'firmado' : c.estado

  const { error } = await db
    .from('contrato_fijacion')
    .update({
      firma_vendedor_url: pub.publicUrl,
      firmado_vendedor_at: ahora,
      estado,
      updated_at: ahora,
    })
    .eq('id', c.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
