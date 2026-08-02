// Ventas — Detalle de un pedido/venta: líneas vendidas, pagos y facturas.
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getPedidoDetalle } from '@/lib/data/ventas'
import { formatoMXN, estadoCobranza, COBRANZA_LABEL, COBRANZA_BADGE } from '@/lib/ventas/tipos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import PedidoDetalleCliente from '@/components/ventas/PedidoDetalleCliente'

export const dynamic = 'force-dynamic'

export default async function PedidoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const { id } = await params
  const pedido = await getPedidoDetalle(id)
  if (!pedido) return notFound()

  const total = pedido.lineas.reduce((s, l) => s + l.importe, 0)
  const cobranza = pedido.estado === 'abierta'
    ? estadoCobranza({ fecha: pedido.fecha, dias_credito: pedido.dias_credito, total, importe_pagado: pedido.importe_pagado })
    : null

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link href="/ventas/pedidos" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          ← Ventas capturadas
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-800">
                {pedido.cliente.nombre}
                {pedido.estado === 'cancelada' && (
                  <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">Cancelada</span>
                )}
              </h1>
              <p className="text-sm text-slate-500">
                {pedido.cliente.rfc} · {pedido.fecha} · {pedido.lineas.length} producto{pedido.lineas.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums text-slate-800">{formatoMXN(total)}</p>
              {cobranza && (
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${COBRANZA_BADGE[cobranza]}`}>
                  {COBRANZA_LABEL[cobranza]}
                </span>
              )}
            </div>
          </div>

          {pedido.estado === 'cancelada' && pedido.motivo_cancelacion && (
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
              <span className="font-medium">Motivo de cancelación:</span> {pedido.motivo_cancelacion}
            </p>
          )}

          <PedidoDetalleCliente pedido={pedido} total={total} />
        </div>
      </div>
    </div>
  )
}
