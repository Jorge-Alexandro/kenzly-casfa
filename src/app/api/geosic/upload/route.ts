// POST /api/geosic/upload
// Receives a multipart form with: file (KML/KMZ) + parcela_id.
// 1. Authenticates the user (RLS context).
// 2. Parses the KML/KMZ to a GeoJSON Polygon.
// 3. Stores the raw file in Supabase Storage (bucket: geosic).
// 4. Calls the upsert_parcela_poligono RPC which writes geom via PostGIS;
//    the geo_recompute() trigger then derives area/perimeter/estado.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { parseKmlOrKmz } from '@/lib/kml'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const form = await request.formData()
  const file = form.get('file')
  const parcelaId = form.get('parcela_id')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  }
  if (typeof parcelaId !== 'string' || !parcelaId) {
    return NextResponse.json({ error: 'Falta parcela_id' }, { status: 400 })
  }

  // --- Parse ---
  const bytes = new Uint8Array(await file.arrayBuffer())
  let parsed
  try {
    parsed = parseKmlOrKmz(bytes, file.name)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'KML inválido' },
      { status: 422 },
    )
  }

  const supabase = await createClient()

  // --- Store the raw file (organized by org slug / parcela) ---
  const ext = file.name.toLowerCase().endsWith('.kmz') ? 'kmz' : 'kml'
  const stamp = Date.now()
  const path = `${session.orgSlug}/${parcelaId}/${stamp}.${ext}`

  const { error: storageError } = await supabase.storage
    .from('geosic')
    .upload(path, bytes, {
      contentType:
        ext === 'kmz'
          ? 'application/vnd.google-earth.kmz'
          : 'application/vnd.google-earth.kml+xml',
      upsert: false,
    })

  // A missing bucket shouldn't block the geometry — warn but continue.
  let archivoUrl: string | null = null
  if (storageError) {
    console.warn('[upload] storage falló (continuo sin archivo):', storageError.message)
  } else {
    const { data: pub } = supabase.storage.from('geosic').getPublicUrl(path)
    archivoUrl = pub.publicUrl
  }

  // --- Persist geometry through the RPC (RLS-enforced) ---
  const { data, error } = await supabase.rpc('upsert_parcela_poligono', {
    p_parcela_id: parcelaId,
    p_geojson: parsed.polygon,
    p_archivo_url: archivoUrl,
    p_es_kmz: ext === 'kmz',
    p_metodo: 'google_earth',
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, poligono: data })
}
