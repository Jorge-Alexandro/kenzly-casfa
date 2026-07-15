// GET /api/ventas/backup — datos completos del módulo para el backup cifrado.
// SOLO rol admin (gerencia/consejo de administración): es el volcado íntegro
// de la información comercial (clientes, precios acordados, ventas).
// Devuelve JSON PLANO por sesión autenticada (RLS acota a la org); el CIFRADO
// ocurre en el navegador con AES-256-GCM y la clave del usuario — la
// contraseña nunca viaja al servidor ni se guarda.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (session.rol !== 'admin') {
    return NextResponse.json(
      { error: 'Solo administradores pueden generar el backup de Ventas' },
      { status: 403 },
    )
  }

  const supabase = await createClient()
  const [clientes, facturas, detalle, stock, precios] = await Promise.all([
    supabase.from('ventas_cliente').select('*').order('nombre'),
    supabase.from('ventas_factura').select('*').order('fecha'),
    supabase.from('ventas_detalle').select('*').order('fecha'),
    supabase.from('ventas_stock').select('*'),
    supabase.from('ventas_precio_cliente').select('*'),
  ])

  const conError = [clientes, facturas, detalle, stock, precios].find((r) => r.error)
  if (conError?.error) {
    return NextResponse.json({ error: conError.error.message }, { status: 400 })
  }

  return NextResponse.json({
    clientes: clientes.data ?? [],
    facturas: facturas.data ?? [],
    ventas_detalle: detalle.data ?? [],
    stock: stock.data ?? [],
    precios_cliente: precios.data ?? [],
    timestamp: new Date().toISOString(),
  })
}
