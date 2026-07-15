// Top productos por importe acumulado — barras horizontales (estilo reporte
// ejecutivo). Conserva la semántica de Pareto: los productos que concentran
// el 80% del ingreso van en naranja sólido, el resto en tono claro.
// Server Component puro (barras en divs, sin SVG ni JS).
import { formatoMXN } from '@/lib/ventas/tipos'

const TOP = 8

export default function GraficaTopProductos({
  productos,
}: {
  productos: { nombre: string; importe: number }[]
}) {
  const orden = [...productos].filter((p) => p.importe > 0).sort((a, b) => b.importe - a.importe)
  if (orden.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">Sin ventas registradas todavía.</p>
  }

  const total = orden.reduce((a, p) => a + p.importe, 0)
  let acumulado = 0
  const filas = orden.slice(0, TOP).map((p) => {
    acumulado += p.importe
    return { ...p, dentro80: acumulado - p.importe < total * 0.8 }
  })
  const max = filas[0].importe

  return (
    <div>
      <div className="space-y-2.5">
        {filas.map((p) => (
          <div key={p.nombre} className="grid grid-cols-[minmax(0,11rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <p className="truncate text-right text-xs leading-tight text-slate-600" title={p.nombre}>
              {p.nombre}
            </p>
            <div className="flex min-w-0 items-center gap-2">
              <div
                className={`h-5 rounded-r-sm ${p.dentro80 ? 'bg-orange-500' : 'bg-orange-200'}`}
                style={{ width: `${Math.max((p.importe / max) * 100, 1.5)}%` }}
                title={`${p.nombre}: ${formatoMXN(p.importe)}`}
              />
              <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500">
                {formatoMXN(p.importe)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
        <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-orange-500" />
        Concentran el 80% del ingreso
        <span className="ml-4 mr-1.5 inline-block h-2 w-2 rounded-sm bg-orange-200" />
        Resto
        {orden.length > TOP && (
          <span className="float-right">
            +{orden.length - TOP} productos más — {formatoMXN(orden.slice(TOP).reduce((a, p) => a + p.importe, 0))}
          </span>
        )}
      </p>
    </div>
  )
}
