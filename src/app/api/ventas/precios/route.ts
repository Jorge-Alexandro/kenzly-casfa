// GET  /api/ventas/precios?cliente_id=… — precios acordados vigentes del
//      cliente (uno por producto, el de vigente_desde más reciente). El
//      formulario de captura manual los usa para pre-cargar el precio.
// POST /api/ventas/precios — fija/actualiza un precio acordado.
//      Body: { cliente_id, producto_id, precio_acordado, tolerancia_pct?, vigente_desde? }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const clienteId = new URL(request.url).searchParams.get('cliente_id')
  if (!clienteId) return NextResponse.json({ error: 'Falta cliente_id' }, { status: 400 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ventas_precio_cliente')
    .select('producto_id, precio_acordado, tolerancia_pct, vigente_desde')
    .eq('cliente_id', clienteId)
    .order('vigente_desde', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Nos quedamos con el vigente más reciente por producto.
  const porProducto: Record<string, { producto_id: string; precio_acordado: number; tolerancia_pct: number }> = {}
  for (const p of data ?? []) {
    if (!porProducto[p.producto_id]) porProducto[p.producto_id] = p
  }
  return NextResponse.json({ precios: Object.values(porProducto) })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const precio_acordado = Number(body.precio_acordado)
  if (!Number.isFinite(precio_acordado) || precio_acordado <= 0) {
    return NextResponse.json({ error: 'Precio acordado inválido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('ventas_precio_cliente').upsert(
    {
      org_id: session.orgId,
      cliente_id: String(body.cliente_id ?? ''),
      producto_id: String(body.producto_id ?? ''),
      precio_acordado,
      tolerancia_pct: Number.isFinite(Number(body.tolerancia_pct)) ? Number(body.tolerancia_pct) : 0.05,
      vigente_desde: String(body.vigente_desde ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    },
    { onConflict: 'cliente_id,producto_id,vigente_desde' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
