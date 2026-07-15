// POST   /api/crm/oportunidades/items — agrega/actualiza un producto de interés
//   (upsert por (oportunidad_id, producto_id); el importe lo calcula la BD).
// DELETE /api/crm/oportunidades/items?id=... — quita un item.
// Los productos reusan el catálogo ventas_producto — nada de catálogos paralelos.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEditorCRM } from '@/lib/crm/guard'

export async function POST(request: Request) {
  const guard = await requireEditorCRM()
  if (!guard.ok) return guard.res

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const oportunidad_id = String(body.oportunidad_id ?? '')
  const producto_id = String(body.producto_id ?? '')
  const cantidad = Number(body.cantidad)
  const precio_objetivo = Number(body.precio_objetivo)
  if (!oportunidad_id || !producto_id) {
    return NextResponse.json({ error: 'Falta oportunidad o producto' }, { status: 400 })
  }
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 })
  }
  if (!Number.isFinite(precio_objetivo) || precio_objetivo < 0) {
    return NextResponse.json({ error: 'Precio inválido' }, { status: 400 })
  }

  const supabase = await createClient()
  const [{ data: opp }, { data: prod }] = await Promise.all([
    supabase.from('crm_oportunidad').select('id').eq('id', oportunidad_id).maybeSingle(),
    supabase.from('ventas_producto').select('id').eq('id', producto_id).maybeSingle(),
  ])
  if (!opp) return NextResponse.json({ error: 'Oportunidad no encontrada' }, { status: 400 })
  if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 400 })

  const { data, error } = await supabase
    .from('crm_oportunidad_item')
    .upsert(
      {
        org_id: guard.session.orgId,
        oportunidad_id,
        producto_id,
        cantidad,
        precio_objetivo,
      },
      { onConflict: 'oportunidad_id,producto_id' },
    )
    .select('id, importe')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: data.id, importe: data.importe })
}

export async function DELETE(request: Request) {
  const guard = await requireEditorCRM()
  if (!guard.ok) return guard.res

  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'Falta id del item' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('crm_oportunidad_item').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
