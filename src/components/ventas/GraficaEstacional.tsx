// Gráfica 1 — Análisis de crecimiento estacional (estilo reporte ejecutivo).
// Curva suave con marcadores + línea punteada de venta promedio + panel
// lateral: narrativa del patrón, tarjetas MES PICO / MES VALLE / PROMEDIO y
// recomendación comercial. Server Component puro (SVG, sin JS al cliente).
import { MESES_LARGO, formatoMXN } from '@/lib/ventas/tipos'

const W = 860
const H = 300
const PAD = { top: 24, right: 28, bottom: 40, left: 78 }

function dinero(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-MX')
}

// Catmull-Rom → cubic bezier para la curva suave de la referencia.
function curvaSuave(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

export default function GraficaEstacional({ meses }: { meses: number[] }) {
  // Meses a graficar: desde enero hasta el último con venta (mínimo 4).
  const ultimo = meses.reduce((max, v, i) => (v > 0 ? i : max), 0)
  const n = Math.max(ultimo + 1, 4)
  const datos = meses.slice(0, n)
  const conVenta = datos.filter((v) => v > 0)

  if (conVenta.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">Sin ventas registradas todavía.</p>
  }

  const max = Math.max(...datos, 1) * 1.08
  const promedio = conVenta.reduce((a, b) => a + b, 0) / conVenta.length
  const idxPico = datos.indexOf(Math.max(...datos))
  const idxValle = datos.indexOf(Math.min(...conVenta))

  // Variaciones mes a mes para narrativa y chips.
  let crecimientoAlPico: number | null = null
  if (idxPico > 0 && datos[0] > 0) crecimientoAlPico = (datos[idxPico] - datos[0]) / datos[0]
  let mayorCaida: { mes: number; pct: number } | null = null
  for (let i = 1; i < n; i++) {
    if (datos[i - 1] > 0) {
      const pct = (datos[i] - datos[i - 1]) / datos[i - 1]
      if (pct < 0 && (!mayorCaida || pct < mayorCaida.pct)) mayorCaida = { mes: i, pct }
    }
  }

  const anchoUtil = W - PAD.left - PAD.right
  const altoUtil = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (anchoUtil * i) / (n - 1)
  const y = (v: number) => PAD.top + altoUtil * (1 - v / max)
  const pts = datos.map((v, i) => ({ x: x(i), y: y(v) }))
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((g) => max * g)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
      {/* Curva */}
      <div className="min-w-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ingresos mensuales">
          {gridVals.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left} y1={y(v)} x2={W - PAD.right} y2={y(v)}
                stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 5"
              />
              <text x={PAD.left - 10} y={y(v) + 3.5} textAnchor="end" fontSize="11" fill="#94a3b8">
                {dinero(v)}
              </text>
            </g>
          ))}

          {/* Venta promedio */}
          <line
            x1={PAD.left} y1={y(promedio)} x2={W - PAD.right} y2={y(promedio)}
            stroke="#64748b" strokeWidth="1.3" strokeDasharray="7 5"
          />
          <text
            x={PAD.left + anchoUtil * 0.62} y={y(promedio) - 6}
            fontSize="11" fill="#64748b"
          >
            Venta Promedio
          </text>

          {/* Curva principal */}
          <path
            d={curvaSuave(pts)}
            fill="none" stroke="#ea7317" strokeWidth="3.5"
            strokeLinecap="round" strokeLinejoin="round"
          />

          {/* Marcadores */}
          {datos.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r="6.5" fill="#fff" stroke="#ea7317" strokeWidth="2.5">
              <title>{`${MESES_LARGO[i]}: ${formatoMXN(v)}`}</title>
            </circle>
          ))}

          {datos.map((_, i) => (
            <text key={i} x={x(i)} y={H - 12} textAnchor="middle" fontSize="12" fill="#64748b">
              {MESES_LARGO[i]}
            </text>
          ))}
        </svg>

        {/* Chips de crecimiento/caída (pie de gráfica, como la referencia) */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm">
          <span className="text-slate-700">
            ↗ Crecimiento {MESES_LARGO[0]}–{MESES_LARGO[idxPico]}:{' '}
            <strong className="text-orange-700">
              {crecimientoAlPico !== null ? `+${(crecimientoAlPico * 100).toFixed(1)}%` : '—'}
            </strong>
          </span>
          {mayorCaida && (
            <span className="text-slate-500">
              Caída estacional en {MESES_LARGO[mayorCaida.mes]} ({(mayorCaida.pct * 100).toFixed(1)}%)
            </span>
          )}
        </div>
      </div>

      {/* Panel lateral */}
      <div className="space-y-3">
        <div className="border-l-4 border-orange-500 bg-orange-50/60 px-3.5 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-orange-900">Patrón estacional</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">
            {crecimientoAlPico !== null && crecimientoAlPico > 0 ? (
              <>
                Aceleración de <strong>+{(crecimientoAlPico * 100).toFixed(1)}%</strong> de{' '}
                {MESES_LARGO[0].toLowerCase()} a {MESES_LARGO[idxPico].toLowerCase()}, impulsada por la
                cosecha y comercialización estacional de café verde, cacao y miel.
              </>
            ) : (
              <>El pico de ventas ocurre en {MESES_LARGO[idxPico].toLowerCase()}.</>
            )}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-3.5 py-2.5">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Mes pico (máximo)</p>
            <p className="text-sm font-bold text-slate-800">{MESES_LARGO[idxPico]}</p>
          </div>
          <p className="font-mono text-sm font-bold tabular-nums text-slate-800">{dinero(datos[idxPico])}</p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-3.5 py-2.5">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Mes valle (mínimo)</p>
            <p className="text-sm font-bold text-slate-800">{MESES_LARGO[idxValle]}</p>
          </div>
          <p className="font-mono text-sm font-bold tabular-nums text-orange-700">{dinero(datos[idxValle])}</p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-3.5 py-2.5">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Promedio mensual</p>
            <p className="text-sm font-bold text-slate-800">
              {MESES_LARGO[0].slice(0, 3)}–{MESES_LARGO[n - 1].slice(0, 3)}
            </p>
          </div>
          <p className="font-mono text-sm font-bold tabular-nums text-slate-800">{dinero(promedio)}</p>
        </div>

        {mayorCaida && (
          <div className="rounded-lg bg-slate-100 px-3.5 py-3">
            <p className="text-xs font-semibold text-slate-700">💡 Recomendación Comercial:</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Alinear la tesorería y el capital de trabajo para amortiguar el descenso cíclico
              observado en {MESES_LARGO[mayorCaida.mes].toLowerCase()}.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
