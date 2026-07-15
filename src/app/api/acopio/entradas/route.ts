// POST /api/acopio/entradas — crea una entrada (queda EN_PESAJE lista para pesar).
// El folio lo asigna el trigger acopio_asignar_folio (consecutivo por org).
// Body: { productor_id?, proveedor_nombre, comunidad?, municipio?, especie, tipo,
//         fecha_acopio?, cosecha?, comentarios?, lat?, lng? }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const especie = String(body.especie ?? '').trim()
  const tipo = String(body.tipo ?? '').trim()
  if (!especie || !tipo) {
    return NextResponse.json({ error: 'Falta especie o tipo' }, { status: 400 })
  }

  const supabase = await createClient()

  // El combo especie→tipo debe existir en el catálogo de la org (§5).
  const { data: prod, error: cErr } = await supabase
    .from('acopio_producto')
    .select('especie, tipo')
    .eq('especie', especie)
    .eq('tipo', tipo)
    .eq('activo', true)
    .maybeSingle()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 })
  if (!prod) {
    return NextResponse.json(
      { error: `Combinación no válida: ${especie} ${tipo}` },
      { status: 400 },
    )
  }

  // Snapshot del proveedor: si viene del padrón, tomamos su nombre/comunidad/
  // municipio de la fuente (validando que pertenezca a la org vía RLS).
  let proveedor_nombre = String(body.proveedor_nombre ?? '').trim()
  let comunidad = body.comunidad ?? null
  let municipio = body.municipio ?? null
  let productor_id: string | null = body.productor_id ?? null

  if (productor_id) {
    const { data: pr, error: pErr } = await supabase
      .from('productores')
      .select('id, nombre_completo, comunidad, municipio')
      .eq('id', productor_id)
      .maybeSingle()
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 })
    if (!pr) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 400 })
    }
    proveedor_nombre = pr.nombre_completo
    comunidad = pr.comunidad
    municipio = pr.municipio
  }

  if (!proveedor_nombre) {
    return NextResponse.json({ error: 'Falta el proveedor' }, { status: 400 })
  }

  const { data: entrada, error: eErr } = await supabase
    .from('entradas')
    .insert({
      org_id: session.orgId,
      productor_id,
      proveedor_nombre,
      comunidad,
      municipio,
      especie,
      tipo,
      fecha_acopio: body.fecha_acopio || undefined,
      cosecha: body.cosecha ?? null,
      comentarios: body.comentarios ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      elaborado_por: session.userId,
      estado: 'en_pesaje',
    })
    .select('id, folio')
    .single()

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: entrada.id, folio: entrada.folio })
}
