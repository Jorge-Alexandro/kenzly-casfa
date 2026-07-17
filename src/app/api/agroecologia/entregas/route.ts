// Entregas de plantas por productor (Agroecología). Para verificar en campo.
//   GET    ?productor_id=…  -> lista las entregas del productor
//   POST   { productor_id, anio, especie, cantidad, fecha_entrega?, observaciones? }
//   DELETE ?id=…            -> borra una entrega
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const productorId = new URL(request.url).searchParams.get('productor_id')
  if (!productorId) return NextResponse.json({ error: 'Falta productor_id' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agro_entrega_planta')
    .select('id, anio, especie, cantidad, fecha_entrega, observaciones')
    .eq('productor_id', productorId)
    .order('anio', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ entregas: data ?? [] })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const productor_id = String(body?.productor_id ?? '')
  const anio = Number(body?.anio)
  const especie = String(body?.especie ?? '').trim()
  const cantidad = Number(body?.cantidad)
  if (!productor_id) return NextResponse.json({ error: 'Falta el productor' }, { status: 400 })
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    return NextResponse.json({ error: 'Año inválido' }, { status: 400 })
  }
  if (!especie) return NextResponse.json({ error: 'Falta la especie' }, { status: 400 })
  if (!Number.isFinite(cantidad) || cantidad < 0) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agro_entrega_planta')
    .insert({
      org_id: session.orgId,
      productor_id,
      anio,
      especie,
      cantidad,
      fecha_entrega: body?.fecha_entrega || null,
      observaciones: body?.observaciones?.trim() || null,
    })
    .select('id, anio, especie, cantidad, fecha_entrega, observaciones')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, entrega: data })
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('agro_entrega_planta').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
