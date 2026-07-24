// POST   /api/gastos       — registra un movimiento de gasto
// PATCH  /api/gastos?id=…  — edita un movimiento
// DELETE /api/gastos?id=…  — borra un movimiento
//
// Sólo Contabilidad (admin/contador); la RLS de `gasto` es la barrera real.
// El servidor valida que la categoría PERTENEZCA al programa: si no, la matriz
// del reporte mostraría un monto en una columna que no existe en ese programa.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionResult } from '@/lib/session'

const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
const txt = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}
const guard = (rol: string) => rol === 'admin' || rol === 'contador'
const FECHA = /^\d{4}-\d{2}-\d{2}$/

export async function POST(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!guard(r.session.rol)) {
    return NextResponse.json({ error: 'Sólo Contabilidad puede registrar gastos.' }, { status: 403 })
  }

  const b = await request.json().catch(() => null)
  const categoria_id = txt(b?.categoria_id)
  const fecha = txt(b?.fecha)
  const monto = num(b?.monto)

  if (!categoria_id) return NextResponse.json({ error: 'Falta la categoría' }, { status: 400 })
  if (!fecha || !FECHA.test(fecha)) return NextResponse.json({ error: 'Falta la fecha' }, { status: 400 })
  if (monto == null || monto <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
  }

  const supabase = await createClient()

  // El programa se toma de la categoría, no del cliente: así no puede llegar un
  // par (programa, categoría) que no exista.
  const { data: cat, error: cErr } = await supabase
    .from('gasto_categoria')
    .select('id, programa_id, activo')
    .eq('id', categoria_id)
    .maybeSingle()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 })
  if (!cat) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
  if (!cat.activo) return NextResponse.json({ error: 'Esa categoría está inactiva' }, { status: 400 })

  const { data, error } = await supabase
    .from('gasto')
    .insert({
      org_id: r.session.orgId,
      programa_id: cat.programa_id,
      categoria_id,
      fecha,
      monto: Math.round(monto * 100) / 100,
      concepto: txt(b?.concepto),
      beneficiario: txt(b?.beneficiario),
      comprobante: txt(b?.comprobante),
      registrado_por: r.session.userId,
    })
    .select('id, programa_id, categoria_id, fecha, monto, concepto, beneficiario, comprobante')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, gasto: { ...data, monto: Number(data.monto) } })
}

export async function PATCH(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!guard(r.session.rol)) {
    return NextResponse.json({ error: 'Sólo Contabilidad puede editar gastos.' }, { status: 403 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el movimiento' }, { status: 400 })

  const b = await request.json().catch(() => null)
  const supabase = await createClient()
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (b && Object.prototype.hasOwnProperty.call(b, 'monto')) {
    const monto = num(b.monto)
    if (monto == null || monto <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
    }
    cambios.monto = Math.round(monto * 100) / 100
  }
  if (b && Object.prototype.hasOwnProperty.call(b, 'fecha')) {
    const fecha = txt(b.fecha)
    if (!fecha || !FECHA.test(fecha)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
    cambios.fecha = fecha
  }
  if (b && Object.prototype.hasOwnProperty.call(b, 'categoria_id')) {
    const categoria_id = txt(b.categoria_id)
    if (!categoria_id) return NextResponse.json({ error: 'Falta la categoría' }, { status: 400 })
    const { data: cat } = await supabase
      .from('gasto_categoria')
      .select('id, programa_id')
      .eq('id', categoria_id)
      .maybeSingle()
    if (!cat) return NextResponse.json({ error: 'Categoría no encontrada' }, { status: 404 })
    cambios.categoria_id = categoria_id
    cambios.programa_id = cat.programa_id
  }
  for (const c of ['concepto', 'beneficiario', 'comprobante'] as const) {
    if (b && Object.prototype.hasOwnProperty.call(b, c)) cambios[c] = txt(b[c])
  }

  const { data, error } = await supabase
    .from('gasto')
    .update(cambios)
    .eq('id', id)
    .select('id, programa_id, categoria_id, fecha, monto, concepto, beneficiario, comprobante')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, gasto: { ...data, monto: Number(data.monto) } })
}

export async function DELETE(request: Request) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!guard(r.session.rol)) {
    return NextResponse.json({ error: 'Sólo Contabilidad puede borrar gastos.' }, { status: 403 })
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta el movimiento' }, { status: 400 })

  const supabase = await createClient()
  const { error } = await supabase.from('gasto').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
