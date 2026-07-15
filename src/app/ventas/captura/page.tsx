// Módulo Ventas — Captura manual (Server Component: carga catálogos; el
// formulario interactivo vive en CapturaVenta).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getClientes, getProductos, getStock } from '@/lib/data/ventas'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import CapturaVenta from '@/components/ventas/CapturaVenta'

export const dynamic = 'force-dynamic'

export default async function CapturaVentaPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const [clientes, productos, stock] = await Promise.all([
    getClientes(),
    getProductos(),
    getStock(),
  ])
  const stockMap: Record<string, number> = {}
  for (const s of stock) stockMap[s.producto_id] = Number(s.cantidad_disponible)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre}>
        <Link
          href="/ventas"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          ← Ventas
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Captura manual de venta</h1>
            <p className="text-sm text-slate-500">
              El precio se pre-carga del acuerdo con el cliente y se puede editar; si se desvía de
              la tolerancia, la venta queda marcada. El inventario se descuenta al guardar.
            </p>
          </div>
          <CapturaVenta
            clientes={clientes}
            productos={productos.map((p) => ({ id: p.id, nombre: p.nombre, linea: p.linea, unidad: p.unidad }))}
            stock={stockMap}
          />
        </div>
      </div>
    </div>
  )
}
