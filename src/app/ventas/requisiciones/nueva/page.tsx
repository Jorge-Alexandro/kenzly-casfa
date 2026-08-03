// Ventas — Nueva requisición: standalone, o pre-llenada desde un pedido ya
// capturado (?pedido_id=…) para no volver a teclear cliente ni productos.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getPedidoDetalle, getProductos, getClientes } from '@/lib/data/ventas'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import NuevaRequisicionForm, { type ItemInicial } from '@/components/ventas/NuevaRequisicionForm'

export const dynamic = 'force-dynamic'

export default async function NuevaRequisicionPage({
  searchParams,
}: {
  searchParams: Promise<{ pedido_id?: string }>
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const sp = await searchParams
  const [productos, clientes, pedido] = await Promise.all([
    getProductos(),
    getClientes(),
    sp.pedido_id ? getPedidoDetalle(sp.pedido_id) : Promise.resolve(null),
  ])

  const itemsIniciales: ItemInicial[] = pedido
    ? pedido.lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad }))
    : []

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link href="/ventas/requisiciones" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          ← Requisiciones
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Nueva requisición</h1>
            <p className="text-sm text-slate-500">
              {pedido
                ? `Pre-llenada con los productos de la venta de ${pedido.cliente.nombre}.`
                : 'Qué y cuánto hay que preparar — se lo dice a torrefacción, no descuenta inventario.'}
            </p>
          </div>

          <NuevaRequisicionForm
            productos={productos.map((p) => ({ id: p.id, nombre: p.nombre, linea: p.linea, unidad: p.unidad, kg_por_unidad: p.kg_por_unidad }))}
            clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
            pedidoId={pedido?.id ?? null}
            clienteInicial={pedido?.cliente.id ?? null}
            itemsIniciales={itemsIniciales}
          />
        </div>
      </div>
    </div>
  )
}
