// POST /api/acopio/proveedores — alta de un proveedor del padrón de ACOPIO
// (independiente del padrón de certificación). Cualquier miembro puede darlo de
// alta desde la captura de entrada.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const nombre = String(body?.nombre ?? '').trim()
  if (!nombre) return NextResponse.json({ error: 'Falta el nombre del proveedor' }, { status: 400 })

  const supabase = await createClient()

  // Reactivar si ya existía (unique org_id,nombre).
  const { data: existente } = await supabase
    .from('acopio_proveedor')
    .select('id')
    .eq('nombre', nombre)
    .maybeSingle()
  if (existente) {
    await supabase.from('acopio_proveedor').update({ activo: true }).eq('id', existente.id)
    return NextResponse.json({
      ok: true,
      proveedor: {
        id: existente.id,
        codigo: '',
        nombre_completo: nombre,
        comunidad: body?.comunidad?.trim() || null,
        municipio: body?.municipio?.trim() || null,
      },
    })
  }

  const { data, error } = await supabase
    .from('acopio_proveedor')
    .insert({
      org_id: session.orgId,
      nombre,
      comunidad: body?.comunidad?.trim() || null,
      municipio: body?.municipio?.trim() || null,
    })
    .select('id, nombre, comunidad, municipio')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    ok: true,
    proveedor: {
      id: data.id,
      codigo: '',
      nombre_completo: data.nombre,
      comunidad: data.comunidad,
      municipio: data.municipio,
    },
  })
}
