// Top clientes por importe — sólo tiene sentido real desde la Fase 1 (antes,
// exportación y público colapsaban en un cliente genérico). Server Component,
// mismo estilo que TablaCatalogo.
import { formatoMXN } from '@/lib/ventas/tipos'
import { TIPO_CLIENTE_LABEL, TIPO_CLIENTE_BADGE } from '@/lib/ventas/tipos'
import type { ClienteRanking } from '@/lib/data/ventas'

export default function TablaTopClientes({ clientes }: { clientes: ClienteRanking[] }) {
  if (clientes.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">Sin ventas registradas todavía.</p>
  }
  const total = clientes.reduce((a, c) => a + c.importe, 0)
  const top = clientes.slice(0, 10)
  const maxPct = top[0].importe / total

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2.5">Rango</th>
            <th className="px-3 py-2.5">Cliente</th>
            <th className="px-3 py-2.5 text-right">Ventas</th>
            <th className="px-3 py-2.5">Última compra</th>
            <th className="px-3 py-2.5 text-right">Importe acumulado</th>
            <th className="px-3 py-2.5 text-right">Participación</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {top.map((c, i) => {
            const pct = c.importe / total
            return (
              <tr key={c.cliente_id} className="transition hover:bg-orange-50/40">
                <td className="px-3 py-3 font-mono text-slate-400">#{i + 1}</td>
                <td className="px-3 py-3">
                  <p className="max-w-[16rem] truncate font-semibold text-slate-800" title={c.nombre}>{c.nombre}</p>
                  <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TIPO_CLIENTE_BADGE[c.tipo_cliente]}`}>
                    {TIPO_CLIENTE_LABEL[c.tipo_cliente]}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700">{c.num_ventas}</td>
                <td className="px-3 py-3 font-mono text-xs text-slate-500">{c.ultima_compra}</td>
                <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-800">
                  {formatoMXN(c.importe)}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-orange-500"
                        style={{ width: `${Math.max((pct / maxPct) * 100, 3)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-xs tabular-nums text-slate-600">
                      {(pct * 100).toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-3 py-2.5 font-mono text-xs text-slate-500">
        Visualizando los {top.length} clientes de mayor facturación de un total de {clientes.length}.
      </p>
    </div>
  )
}
