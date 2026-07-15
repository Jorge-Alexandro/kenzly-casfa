// Comparativa: Ventas ($ MXN) vs Volumen físico (KG) por línea de producto.
// Barras AGRUPADAS de doble eje (estilo reporte ejecutivo): naranja = importe
// (eje izquierdo), café = kg (eje derecho). Server Component puro.
import { formatoMXN, formatoNum } from '@/lib/ventas/tipos'

const W = 860
const H = 320
const PAD = { top: 20, right: 66, bottom: 56, left: 78 }

const COLOR_IMPORTE = '#ea7317' // naranja CASFA
const COLOR_KG = '#9a6b4f' // café (volumen físico)

function dinero(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-MX')
}

function kgFmt(n: number): string {
  return `${Math.round(n).toLocaleString('es-MX')} kg`
}

export default function GraficaValorVolumen({
  lineas,
}: {
  lineas: { linea: string; importe: number; kg: number }[]
}) {
  const datos = lineas.filter((l) => l.importe > 0 || l.kg > 0)
  if (datos.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">Sin ventas registradas todavía.</p>
  }

  const maxImp = Math.max(...datos.map((l) => l.importe), 1) * 1.05
  const maxKg = Math.max(...datos.map((l) => l.kg), 1) * 1.05
  const anchoUtil = W - PAD.left - PAD.right
  const altoUtil = H - PAD.top - PAD.bottom
  const paso = anchoUtil / datos.length
  const anchoBarra = Math.min(paso * 0.28, 42)
  const hueco = 6
  const xCentro = (i: number) => PAD.left + paso * i + paso / 2
  const yImp = (v: number) => PAD.top + altoUtil * (1 - v / maxImp)
  const yKg = (v: number) => PAD.top + altoUtil * (1 - v / maxKg)
  const base = PAD.top + altoUtil

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-center gap-5 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLOR_IMPORTE }} />
          Ventas facturadas ($ MXN)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLOR_KG }} />
          Volumen comercializado (KG)
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ventas contra volumen por línea">
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line
              x1={PAD.left} y1={yImp(maxImp * g)} x2={W - PAD.right} y2={yImp(maxImp * g)}
              stroke="#e2e8f0" strokeDasharray="4 5"
            />
            <text x={PAD.left - 10} y={yImp(maxImp * g) + 3.5} textAnchor="end" fontSize="11" fill="#94a3b8">
              {dinero(maxImp * g)}
            </text>
            <text x={W - PAD.right + 10} y={yKg(maxKg * g) + 3.5} textAnchor="start" fontSize="11" fill={COLOR_KG}>
              {kgFmt(maxKg * g)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} y1={base} x2={W - PAD.right} y2={base} stroke="#cbd5e1" />

        {datos.map((l, i) => {
          const cx = xCentro(i)
          const precioKilo = l.kg > 0 ? l.importe / l.kg : null
          return (
            <g key={l.linea}>
              {/* Barra de importe */}
              <rect
                x={cx - anchoBarra - hueco / 2}
                y={yImp(l.importe)}
                width={anchoBarra}
                height={Math.max(base - yImp(l.importe), l.importe > 0 ? 2 : 0)}
                rx="2.5"
                fill={COLOR_IMPORTE}
              >
                <title>{`${l.linea}: ${formatoMXN(l.importe)}${precioKilo ? ` · ${formatoMXN(precioKilo)}/kg` : ''}`}</title>
              </rect>
              {/* Barra de kg */}
              <rect
                x={cx + hueco / 2}
                y={yKg(l.kg)}
                width={anchoBarra}
                height={Math.max(base - yKg(l.kg), l.kg > 0 ? 2 : 0)}
                rx="2.5"
                fill={COLOR_KG}
              >
                <title>{`${l.linea}: ${formatoNum(l.kg)} kg`}</title>
              </rect>
              <text x={cx} y={H - 34} textAnchor="middle" fontSize="11" fill="#475569">
                {l.linea.length > 15 ? (
                  <>
                    <tspan x={cx} dy="0">{l.linea.slice(0, 15)}</tspan>
                    <tspan x={cx} dy="12">{l.linea.slice(15, 33)}</tspan>
                  </>
                ) : (
                  l.linea
                )}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="mt-2 text-center text-xs text-slate-500">
        Las líneas premium (Café Tostado) capturan mayor valor por kilogramo que el granel de exportación.
      </p>
    </div>
  )
}
