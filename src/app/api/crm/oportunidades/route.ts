// POST  /api/crm/oportunidades — alta (opcionalmente con productos de interés).
// PATCH /api/crm/oportunidades — edición de campos generales.
//   El cambio de ETAPA tiene su propia ruta (/api/crm/oportunidades/etapa):
//   ahí viven las reglas de motivo de pérdida y vínculo con Ventas.
// El importe de cada item lo calcula la BD (columna generada) — no se confía
// en el cliente. Si no mandan monto_estimado pero sí items, el monto se toma
// de la suma de items.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEditorCRM, textoOpcional } from '@/lib/crm/guard'

interface ItemBody {
  producto_id: string
  cantidad: number
  precio_objetivo: number
}

function parseItems(raw: unknown): ItemBody[] | { error: string } {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return { error: 'items debe ser una lista' }
  const items: ItemBody[] = []
  for (const it of raw) {
    const producto_id = String(it?.producto_id ?? '')
    const cantidad = Number(it?.cantidad)
    const precio_objetivo = Number(it?.precio_objetivo)
    if (!producto_id) return { error: 'Item sin producto' }
    if (!Number.isFinite(cantidad) || cantidad <= 0) return { error: 'Cantidad inválida en items' }
    if (!Number.isFinite(precio_objetivo) || precio_objetivo < 0) return { error: 'Precio inválido en items' }
    items.push({ producto_id, cantidad, precio_objetivo })
  }
  return items
}

function fechaOpcional(v: unknown): string | null {
  const s = String(v ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export async function POST(request: Request) {
  const guard = await requireEditorCRM()
  if (!guard.ok) return guard.res

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const cuenta_id = String(body.cuenta_id ?? '')
  const nombre = String(body.nombre ?? '').trim()
  if (!cuenta_id) return NextResponse.json({ error: 'Falta la cuenta' }, { status: 400 })
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

  const items = parseItems(body.items)
  if (!Array.isArray(items)) return NextResponse.json({ error: items.error }, { status: 400 })

  const probabilidad = Number.isFinite(Number(body.probabilidad))
    ? Math.min(100, Math.max(0, Math.round(Number(body.probabilidad))))
    : 50
  let monto = Number(body.monto_estimado)
  if (!Number.isFinite(monto) || monto < 0) monto = 0
  if (monto === 0 && items.length > 0) {
    monto = Math.round(items.reduce((s, it) => s + it.cantidad * it.precio_objetivo, 0) * 100) / 100
  }

  const supabase = await createClient()
  const { data: cuenta } = await supabase.from('crm_cuenta').select('id').eq('id', cuenta_id).maybeSingle()
  if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 400 })

  if (items.length > 0) {
    // Productos del catálogo de Ventas, visibles = de mi org (RLS).
    const ids = items.map((i) => i.producto_id)
    const { data: prods } = await supabase.from('ventas_producto').select('id').in('id', ids)
    if ((prods ?? []).length !== new Set(ids).size) {
      return NextResponse.json({ error: 'Algún producto no existe en el catálogo' }, { status: 400 })
    }
  }

  const { data: opp, error } = await supabase
    .from('crm_oportunidad')
    .insert({
      org_id: guard.session.orgId,
      cuenta_id,
      nombre,
      monto_estimado: monto,
      probabilidad,
      fecha_cierre_estimada: fechaOpcional(body.fecha_cierre_estimada),
      origen: textoOpcional(body.origen),
      notas: textoOpcional(body.notas),
      responsable_id: textoOpcional(body.responsable_id),
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (items.length > 0) {
    const { error: iErr } = await supabase.from('crm_oportunidad_item').insert(
      items.map((it) => ({
        org_id: guard.session.orgId,
        oportunidad_id: opp.id,
        producto_id: it.producto_id,
        cantidad: it.cantidad,
        precio_objetivo: it.precio_objetivo,
      })),
    )
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, id: opp.id })
}

export async function PATCH(request: Request) {
  const guard = await requireEditorCRM()
  if (!guard.ok) return guard.res

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'Falta id de la oportunidad' }, { status: 400 })

  const supabase = await createClient()
  const { data: opp } = await supabase.from('crm_oportunidad').select('id').eq('id', id).maybeSingle()
  if (!opp) return NextResponse.json({ error: 'Oportunidad no encontrada' }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if (body.nombre !== undefined) {
    const nombre = String(body.nombre ?? '').trim()
    if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    patch.nombre = nombre
  }
  if (body.monto_estimado !== undefined) {
    const monto = Number(body.monto_estimado)
    if (!Number.isFinite(monto) || monto < 0) {
      return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
    }
    patch.monto_estimado = monto
  }
  if (body.probabilidad !== undefined) {
    const p = Number(body.probabilidad)
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      return NextResponse.json({ error: 'Probabilidad inválida (0–100)' }, { status: 400 })
    }
    patch.probabilidad = Math.round(p)
  }
  if (body.fecha_cierre_estimada !== undefined) patch.fecha_cierre_estimada = fechaOpcional(body.fecha_cierre_estimada)
  if (body.origen !== undefined) patch.origen = textoOpcional(body.origen)
  if (body.notas !== undefined) patch.notas = textoOpcional(body.notas)
  if (body.responsable_id !== undefined) patch.responsable_id = textoOpcional(body.responsable_id)
  // etapa/motivo_perdida se cambian SOLO por /api/crm/oportunidades/etapa

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }
  const { error } = await supabase.from('crm_oportunidad').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
