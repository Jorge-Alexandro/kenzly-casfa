// PATCH /api/ventas/productos/[id] — edita línea, unidad, kg_por_unidad o
// clave_sat de un producto del catálogo (Tabulador). No toca el nombre: ese
// es el mismo texto que factura el SAT y con el que el importador de CFDI
// hace match (ver /api/ventas/facturas) — cambiarlo aquí desincroniza el
// catálogo de lo que trae cada factura nueva.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const cambios: Record<string, unknown> = {}

  if ('linea' in body) {
    const linea = String(body.linea ?? '').trim()
    if (!linea) return NextResponse.json({ error: 'La línea no puede quedar vacía' }, { status: 400 })
    cambios.linea = linea
  }
  if ('unidad' in body) {
    const unidad = String(body.unidad ?? '').trim().toUpperCase()
    if (!unidad) return NextResponse.json({ error: 'La unidad no puede quedar vacía' }, { status: 400 })
    cambios.unidad = unidad
  }
  if ('kg_por_unidad' in body) {
    const kg = Number(body.kg_por_unidad)
    if (!Number.isFinite(kg) || kg <= 0) {
      return NextResponse.json({ error: 'kg_por_unidad debe ser un número mayor a 0' }, { status: 400 })
    }
    cambios.kg_por_unidad = kg
  }
  if ('clave_sat' in body) {
    const clave = String(body.clave_sat ?? '').trim()
    cambios.clave_sat = clave || null
  }
  if ('activo' in body) {
    cambios.activo = Boolean(body.activo)
  }

  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('ventas_producto').update(cambios).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
