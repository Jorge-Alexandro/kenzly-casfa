// POST /api/acopio/entradas/[id]/calidad — guarda análisis de calidad, firmas y
// fotos de una entrada. Las imágenes llegan como data URL y se suben a Storage
// (bucket `geosic`, carpeta acopio/{entrada}/); en la fila queda la URL pública.
//
// La CALIDAD se captura en GRAMOS, como manda el manual de CASFA (Doc R.3): el
// almacenista pesa, no calcula. El cliente muestra los porcentajes en vivo, pero
// aquí NO se confía en ellos: el servidor recalcula las fracciones desde los
// gramos con el mismo motor (lib/acopio/calidad.mjs) y guarda las dos cosas.
//
// Body: { oro_g?, cerezo_g?, zaranda_16_g?, ..., humedad?, cosecha?, comentarios?,
//         estado?, firma_receptor?, firma_proveedor?, foto_calidad?, ... }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { calcularCalidad, aplicaRendimiento } from '@/lib/acopio/calidad.mjs'

// Gramos que se pesan en la báscula (entrada primaria del análisis).
const GRAMOS = [
  'oro_g', 'cerezo_g', 'zaranda_16_g', 'zaranda_15_g', 'caracol_g', 'mancha_g',
] as const

// Fracciones que salen del motor (resultado).
const FRACCIONES = [
  'rendimiento', 'cerezo', 'zaranda_16', 'zaranda_15', 'caracol', 'mancha', 'humedad',
] as const

const numOrNull = (v: unknown) =>
  v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v)

// campo del body → columna de la entrada
const IMAGENES: Record<string, string> = {
  firma_receptor: 'firma_receptor_url',
  firma_proveedor: 'firma_proveedor_url',
  foto_calidad: 'foto_calidad_url',
  foto_muestra: 'foto_muestra_url',
  foto_libreta: 'foto_libreta_url',
  foto_libreta2: 'foto_libreta2_url',
}

// Sólo png/jpg: son los formatos que el generador de PDF (react-pdf) sabe
// incrustar. Evita guardar un webp que luego reviente el recibo.
function dataUrlABytes(dataUrl: string): { bytes: Uint8Array; ext: string; mime: string } | null {
  const m = /^data:(image\/(png|jpe?g));base64,(.+)$/i.exec(dataUrl)
  if (!m) return null
  const mime = m[1].toLowerCase()
  return { bytes: Buffer.from(m[3], 'base64'), ext: mime.includes('png') ? 'png' : 'jpg', mime }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const supabase = await createClient()

  // Valida que la entrada exista y sea de la org (RLS).
  const { data: entrada, error: eErr } = await supabase
    .from('entradas')
    .select('id, especie, tipo')
    .eq('id', params.id)
    .maybeSingle()
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 })
  if (!entrada) return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  // ── Calidad: gramos → fracciones (autoridad del servidor) ─────────────────
  const mandaCalidad = GRAMOS.some((k) => k in body) || 'humedad' in body
  if (mandaCalidad) {
    // Las bases (300 g / 100 g) y las normas viven en el catálogo, no en código.
    const { data: prod } = await supabase
      .from('acopio_producto')
      .select('muestra_g, analisis_g, rend_min, mancha_max, cerezo_max, humedad_min, humedad_max, zaranda16_min')
      .eq('especie', entrada.especie)
      .eq('tipo', entrada.tipo)
      .maybeSingle()

    const cfg = {
      ...(prod ?? {}),
      rendimiento_aplica: aplicaRendimiento(entrada.especie, entrada.tipo),
    }
    const captura = Object.fromEntries(
      [...GRAMOS, 'humedad'].map((k) => [k, numOrNull(body[k])]),
    )
    const r = calcularCalidad(captura, cfg)

    for (const k of GRAMOS) patch[k] = captura[k]
    for (const k of FRACCIONES) patch[k] = r[k]
    patch.muestra_g = r.muestra_g
    patch.analisis_g = r.analisis_g
  }

  if ('cosecha' in body) patch.cosecha = body.cosecha || null
  if ('comentarios' in body) patch.comentarios = body.comentarios || null
  if ('estado' in body) patch.estado = body.estado

  // Imágenes: data URL → Storage → URL pública.
  for (const [campo, columna] of Object.entries(IMAGENES)) {
    if (!(campo in body)) continue
    const valor = body[campo]
    if (!valor) {
      patch[columna] = null
      continue
    }
    if (typeof valor === 'string' && valor.startsWith('http')) continue // ya subida
    const img = typeof valor === 'string' ? dataUrlABytes(valor) : null
    if (!img) continue
    const path = `acopio/${params.id}/${campo}-${Date.now()}.${img.ext}`
    const { error: upErr } = await supabase.storage
      .from('geosic')
      .upload(path, img.bytes, { contentType: img.mime, upsert: true })
    if (upErr) return NextResponse.json({ error: `Subiendo ${campo}: ${upErr.message}` }, { status: 400 })
    const { data: pub } = supabase.storage.from('geosic').getPublicUrl(path)
    patch[columna] = pub.publicUrl
  }

  const { error } = await supabase.from('entradas').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
