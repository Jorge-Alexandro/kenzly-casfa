// Ventas — Listado de pedidos capturados, con semáforo de cobranza:
// verde=pagado, gris=al corriente, amarillo=por vencer (10 días antes del
// límite de crédito), rojo=moroso. Puro cálculo de fecha+saldo — nada que
// sincronizar (ver estadoCobranza en lib/ventas/tipos.ts).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getPedidos } from '@/lib/data/ventas'
import { formatoMXN, estadoCobranza, COBRANZA_LABEL, COBRANZA_BADGE } from '@/lib/ventas/tipos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import BotonBorrar from '@/components/ventas/BotonBorrar'

export const dynamic = 'force-dynamic'

export default async function PedidosPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const pedidos = await getPedidos()
  const abiertos = pedidos.filter((p) => p.estado === 'abierta')
  const conEstado = abiertos.map((p) => ({
    ...p,
    cobranza: estadoCobranza({ fecha: p.fecha, dias_credito: p.dias_credito, total: p.total, importe_pagado: p.importe_pagado }),
  }))
  const moroso = conEstado.filter((p) => p.cobranza === 'moroso')
  const porVencer = conEstado.filter((p) => p.cobranza === 'por_vencer')
  const totalPorCobrar = abiertos.reduce((s, p) => s + Math.max(0, p.total - p.importe_pagado), 0)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link href="/ventas" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          ← Reporte
        </Link>
        <Link href="/ventas/captura" className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700">
          + Nueva venta
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Ventas capturadas</h1>
            <p className="text-sm text-slate-500">
              {pedidos.length} venta{pedidos.length === 1 ? '' : 's'} · cobranza de las {abiertos.length} abiertas.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Por cobrar" value={formatoMXN(totalPorCobrar)} destacado />
            <Kpi label="Por vencer (10 días)" value={String(porVencer.length)} tono="amber" />
            <Kpi label="Morosas" value={String(moroso.length)} tono="rose" />
            <Kpi label="Pedidos abiertos" value={String(abiertos.length)} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Fecha</th>
                  <th className="px-3 py-2.5">Cliente</th>
                  <th className="px-3 py-2.5 text-right">Productos</th>
                  <th className="px-3 py-2.5 text-right">Total</th>
                  <th className="px-3 py-2.5 text-right">Pagado</th>
                  <th className="px-3 py-2.5 text-right">Saldo</th>
                  <th className="px-3 py-2.5">Cobranza</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pedidos.map((p) => {
                  const cobranza = p.estado === 'abierta'
                    ? estadoCobranza({ fecha: p.fecha, dias_credito: p.dias_credito, total: p.total, importe_pagado: p.importe_pagado })
                    : null
                  const saldo = p.total - p.importe_pagado
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 text-slate-600">{p.fecha}</td>
                      <td className="px-3 py-2 text-slate-800">
                        {p.cliente_nombre}
                        {p.estado === 'cancelada' && (
                          <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">cancelada</span>
                        )}
                        {p.n_facturas > 0 && (
                          <span className="ml-1.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">{p.n_facturas} fact.</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{p.n_lineas}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{formatoMXN(p.total)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatoMXN(p.importe_pagado)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${saldo > 0.005 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {formatoMXN(saldo)}
                      </td>
                      <td className="px-3 py-2">
                        {cobranza && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COBRANZA_BADGE[cobranza]}`}>
                            {COBRANZA_LABEL[cobranza]}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-3">
                          <Link href={`/ventas/pedidos/${p.id}`} className="text-xs font-medium text-orange-700 hover:underline">
                            Ver
                          </Link>
                          <BotonBorrar
                            url={`/api/ventas/pedidos/${p.id}`}
                            descripcion={`la venta de ${p.cliente_nombre} del ${p.fecha} por ${formatoMXN(p.total)}`}
                            advertencia="Se borran también sus pagos y facturas, y el inventario se repone."
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {pedidos.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">
                Todavía no hay ventas capturadas. <Link href="/ventas/captura" className="text-orange-700 hover:underline">Captura la primera</Link>.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, destacado, tono }: { label: string; value: string; destacado?: boolean; tono?: 'amber' | 'rose' }) {
  const color = destacado ? 'border-orange-200 bg-orange-50' : tono === 'amber' ? 'border-amber-200 bg-amber-50' : tono === 'rose' ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'
  const texto = destacado ? 'text-orange-700' : tono === 'amber' ? 'text-amber-700' : tono === 'rose' ? 'text-rose-700' : 'text-slate-800'
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${texto}`}>{value}</p>
    </div>
  )
}
