// Tabla de catálogo (Top 10 por facturación) — estilo reporte ejecutivo:
// rango, producto con KG equivalentes, badge de línea, cantidad, precio
// promedio, importe acumulado y barra de participación. Server Component.
import { formatoMXN, formatoNum } from '@/lib/ventas/tipos'
import type { VentasProductoMesExt } from '@/lib/data/ventas'

const BADGE_LINEA: Record<string, string> = {
  'Café Tostado': 'bg-orange-50 text-orange-700',
  'Café Verde': 'bg-amber-50 text-amber-700',
  'Café Robusta Export.': 'bg-orange-100 text-orange-800',
  'Cacao en Grano': 'bg-yellow-50 text-yellow-800',
  'Chocolate y Derivados': 'bg-stone-100 text-stone-700',
  Miel: 'bg-amber-100 text-amber-800',
  Canela: 'bg-red-50 text-red-700',
}

export default function TablaCatalogo({
  matriz,
  totalCatalogo,
}: {
  matriz: VentasProductoMesExt[]
  totalCatalogo: number
}) {
  const orden = [...matriz].filter((m) => m.total_importe > 0).sort((a, b) => b.total_importe - a.total_importe)
  const total = orden.reduce((a, m) => a + m.total_importe, 0)
  const top = orden.slice(0, 10)
  if (top.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">Sin ventas registradas todavía.</p>
  }
  const maxPct = top[0].total_importe / total

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2.5">Rango</th>
            <th className="px-3 py-2.5">Producto</th>
            <th className="px-3 py-2.5">Línea de negocio</th>
            <th className="px-3 py-2.5 text-right">Cant. vendida</th>
            <th className="px-3 py-2.5 text-right">Precio prom.</th>
            <th className="px-3 py-2.5 text-right">Importe acumulado</th>
            <th className="px-3 py-2.5 text-right">Participación</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {top.map((m, i) => {
            const pct = m.total_importe / total
            const kg = m.total_cantidad * m.kg_por_unidad
            return (
              <tr key={m.producto_id} className="transition hover:bg-orange-50/40">
                <td className="px-3 py-3 font-mono text-slate-400">#{i + 1}</td>
                <td className="px-3 py-3">
                  <p className="max-w-[22rem] truncate font-semibold text-slate-800" title={m.nombre}>
                    {m.nombre}
                  </p>
                  <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                    ⚖ {formatoNum(kg)} KG
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_LINEA[m.linea] ?? 'bg-slate-100 text-slate-600'}`}>
                    {m.linea}
                  </span>
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700">
                  {formatoNum(m.total_cantidad)}
                </td>
                <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-700">
                  {m.total_cantidad > 0 ? formatoMXN(m.total_importe / m.total_cantidad) : '—'}
                </td>
                <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-800">
                  {formatoMXN(m.total_importe)}
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
        Visualizando los {top.length} productos de mayor facturación de un catálogo de {totalCatalogo} productos.
      </p>
    </div>
  )
}
