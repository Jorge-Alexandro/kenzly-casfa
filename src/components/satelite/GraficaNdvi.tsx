'use client'

// Serie de tiempo de NDVI en SVG puro (misma decisión que las gráficas de
// Ventas: cero librerías nuevas). Bandas de fondo = umbrales de alerta, para
// que la caída se lea sin tener que interpretar el número.
import type { IndiceHistorial } from '@/lib/satelite/indices'
import { UMBRAL_NDVI, ALERTA_COLOR, colorNdvi } from '@/lib/satelite/indices'

const W = 280
const H = 120
const PAD_X = 26
const PAD_Y = 8

export default function GraficaNdvi({ datos }: { datos: IndiceHistorial[] }) {
  const puntos = datos.filter((d) => d.ndvi_promedio !== null)

  if (puntos.length === 0) {
    return (
      <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">
        Aún no hay serie histórica para esta parcela.
      </p>
    )
  }

  // Eje Y fijo 0–1: el NDVI vive ahí y una escala fija permite comparar
  // parcelas entre sí de un vistazo.
  const x = (i: number) =>
    PAD_X +
    (puntos.length === 1 ? (W - PAD_X * 2) / 2 : (i / (puntos.length - 1)) * (W - PAD_X * 2))
  const y = (v: number) => PAD_Y + (1 - v) * (H - PAD_Y * 2)

  const linea = puntos
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.ndvi_promedio!).toFixed(1)}`)
    .join(' ')

  const bandas = [
    { desde: UMBRAL_NDVI.normal, hasta: 1, color: ALERTA_COLOR.normal },
    { desde: UMBRAL_NDVI.estres_hidrico, hasta: UMBRAL_NDVI.normal, color: ALERTA_COLOR.estres_hidrico },
    { desde: UMBRAL_NDVI.posible_enfermedad, hasta: UMBRAL_NDVI.estres_hidrico, color: ALERTA_COLOR.posible_enfermedad },
    { desde: 0, hasta: UMBRAL_NDVI.posible_enfermedad, color: ALERTA_COLOR.critico },
  ]

  const primera = puntos[0].fecha_imagen
  const ultima = puntos[puntos.length - 1].fecha_imagen

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Serie histórica de NDVI"
      >
        {bandas.map((b) => (
          <rect
            key={b.desde}
            x={PAD_X}
            y={y(b.hasta)}
            width={W - PAD_X * 2}
            height={y(b.desde) - y(b.hasta)}
            fill={b.color}
            opacity={0.09}
          />
        ))}

        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
          <g key={v}>
            <line
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y(v)}
              y2={y(v)}
              stroke="#e2e8f0"
              strokeWidth="0.5"
            />
            <text x={2} y={y(v) + 3} fontSize="7" fill="#94a3b8">
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        <path d={linea} fill="none" stroke="#0f172a" strokeWidth="1.5" />

        {puntos.map((p, i) => (
          <circle
            key={p.fecha_imagen}
            cx={x(i)}
            cy={y(p.ndvi_promedio!)}
            r={i === puntos.length - 1 ? 3.5 : 2.5}
            fill={colorNdvi(p.ndvi_promedio)}
            stroke="#ffffff"
            strokeWidth="1"
          >
            <title>{`${p.fecha_imagen}: NDVI ${p.ndvi_promedio!.toFixed(3)}`}</title>
          </circle>
        ))}
      </svg>

      <div className="flex justify-between px-1 text-[10px] text-slate-400">
        <span>{primera}</span>
        <span>{ultima}</span>
      </div>
    </div>
  )
}
