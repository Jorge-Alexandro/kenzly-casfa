// POST /api/geosic/eliminar-poligono — borra por completo una versión de
// polígono (no solo "rechazar", que deja la geometría mala activa en el mapa).
// Pensado para levantamientos de prueba o errores de digitalización que no
// tienen ningún valor y solo estorban en GeoSIC.
//
// Solo admin: es destructivo y, a diferencia de "rechazar", no deja rastro.
// Body: { poligono_id }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (session.rol !== 'admin') {
    return NextResponse.json(
      { error: 'Solo un admin puede eliminar un polígono' },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  const poligonoId = body?.poligono_id
  if (typeof poligonoId !== 'string' || !poligonoId) {
    return NextResponse.json({ error: 'Falta poligono_id' }, { status: 400 })
  }

  const supabase = await createClient()

  // RLS ya limita a la organización del usuario.
  const { data: poligono, error: fErr } = await supabase
    .from('parcela_poligonos')
    .select('id, parcela_id, activo, version, archivo_kml_url, archivo_kmz_url')
    .eq('id', poligonoId)
    .maybeSingle()
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 400 })
  if (!poligono) return NextResponse.json({ error: 'Polígono no encontrado' }, { status: 404 })

  const { error: delErr } = await supabase
    .from('parcela_poligonos')
    .delete()
    .eq('id', poligonoId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })

  // Era el activo: la parcela se queda sin polígono a menos que exista una
  // versión anterior — en ese caso se reactiva, en vez de dejarla "sin
  // polígono" cuando en realidad sí hay un levantamiento bueno más viejo.
  let reactivada: number | null = null
  if (poligono.activo) {
    const { data: anterior } = await supabase
      .from('parcela_poligonos')
      .select('id, version')
      .eq('parcela_id', poligono.parcela_id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (anterior) {
      const { error: reactErr } = await supabase
        .from('parcela_poligonos')
        .update({ activo: true })
        .eq('id', anterior.id)
      if (!reactErr) reactivada = anterior.version
    }
  }

  // Best-effort: borrar también el archivo en Storage, si lo había.
  const archivoUrl = poligono.archivo_kml_url ?? poligono.archivo_kmz_url
  if (archivoUrl) {
    const marca = '/object/public/geosic/'
    const i = archivoUrl.indexOf(marca)
    if (i >= 0) {
      const path = archivoUrl.slice(i + marca.length)
      await supabase.storage.from('geosic').remove([path]).catch(() => {})
    }
  }

  return NextResponse.json({ ok: true, reactivada_version: reactivada })
}
