// Participación por línea de producto — dona con el total al centro y
// leyenda con porcentajes (estilo reporte ejecutivo, paleta CASFA naranja).
// Server Component puro.
import { formatoMXN } from '@/lib/ventas/tipos'

// Naranjas CASFA de mayor a menor participación; gris para el residual.
const PALETA = ['#ea7317', '#f8b155', '#9a3412', '#fcd34d', '#c2410c', '#fb923c', '#78716c', '#94a3b8']

function dineroCompacto(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 2 })}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

export default function GraficaDona({
  lineas,
}: {
  lineas: { linea: string; importe: number }[]
}) {
  const conVenta = lineas.filter((l) => l.importe > 0)
  const total = conVenta.reduce((a, l) => a + l.importe, 0)
  if (total === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">Sin ventas registradas todavía.</p>
  }

  const orden = [...conVenta].sort((a, b) => b.importe - a.importe)
  const segmentos = orden.map((l, i) => ({
    ...l,
    pct: l.importe / total,
    color: PALETA[i % PALETA.length],
  }))

  // Dona con círculos pathLength=100: dasharray = participación, offset = acumulado.
  const R = 70
  const GROSOR = 26
  let acumulado = 0

  return (
    <div className="flex flex-col items-center gap-5">
      <svg viewBox="0 0 200 200" className="w-56 max-w-full" role="img" aria-label="Participación por línea">
        {segmentos.map((s) => {
          const el = (
            <circle
              key={s.linea}
              cx="100" cy="100" r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={GROSOR}
              pathLength={100}
              strokeDasharray={`${s.pct * 100} ${100 - s.pct * 100}`}
              strokeDashoffset={-acumulado}
              transform="rotate(-90 100 100)"
            >
              <title>{`${s.linea}: ${formatoMXN(s.importe)} (${(s.pct * 100).toFixed(1)}%)`}</title>
            </circle>
          )
          acumulado += s.pct * 100
          return el
        })}
        <text x="100" y="88" textAnchor="middle" fontSize="9" fill="#94a3b8" letterSpacing="1.5">
          VENTAS
        </text>
        <text x="100" y="106" textAnchor="middle" fontSize="17" fontWeight="700" fill="#1e293b">
          {dineroCompacto(total)}
        </text>
        <text x="100" y="120" textAnchor="middle" fontSize="9" fill="#94a3b8">
          MXN total
        </text>
      </svg>

      <div className="grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2">
        {segmentos.map((s) => (
          <div
            key={s.linea}
            className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="truncate">{s.linea}:</span>
            </span>
            <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-slate-800">
              {(s.pct * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
