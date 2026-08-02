// Inventario de producto terminado — pestaña APARTE de Ventas (petición
// explícita: "inventario ponlo en otra pestaña aparte"). La venta ya
// descuenta stock sola (Fase 4, vía pedido); aquí sólo viven los movimientos
// que NO son venta: regalía, cortesía, merma, ajuste, entrada.
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getStock, getMovimientos, getProductos, getClientes } from '@/lib/data/ventas'
import { formatoNum } from '@/lib/ventas/tipos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import MovimientosCliente from '@/components/ventas/MovimientosCliente'

export const dynamic = 'force-dynamic'

export default async function InventarioPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const [stock, movimientos, productos, clientes] = await Promise.all([
    getStock(),
    getMovimientos(),
    getProductos(),
    getClientes(),
  ])

  const negativos = stock.filter((s) => Number(s.cantidad_disponible) < 0)
  const stockOrdenado = [...stock].sort((a, b) => (a.producto?.nombre ?? '').localeCompare(b.producto?.nombre ?? ''))

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Inventario de producto terminado</h1>
            <p className="text-sm text-slate-500">
              Se descuenta solo con cada venta capturada. Aquí se registra lo que no es venta:
              regalías, cortesías, mermas y ajustes al conteo físico.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Productos con stock</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-800">{stock.length}</p>
            </div>
            <div className={`rounded-xl border p-4 ${negativos.length > 0 ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">En negativo</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${negativos.length > 0 ? 'text-rose-700' : 'text-slate-800'}`}>{negativos.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Movimientos registrados</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-800">{movimientos.length}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">Existencias</h2>
            {stockOrdenado.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400">Sin registros todavía.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {stockOrdenado.map((s) => (
                      <tr key={s.producto_id}>
                        <td className="max-w-[24rem] truncate px-4 py-2 text-slate-700">{s.producto?.nombre ?? '—'}</td>
                        <td className={`px-4 py-2 text-right font-mono tabular-nums ${Number(s.cantidad_disponible) < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                          {formatoNum(Number(s.cantidad_disponible), 3)} {s.unidad}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <MovimientosCliente
            movimientos={movimientos}
            productos={productos.map((p) => ({ id: p.id, nombre: p.nombre, linea: p.linea, unidad: p.unidad }))}
            clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
          />
        </div>
      </div>
    </div>
  )
}
