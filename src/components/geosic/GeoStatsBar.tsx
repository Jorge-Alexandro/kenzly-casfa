// Coverage indicators bar (for the coordinator): how many parcelas are
// mapped, validated, critical, or still missing a polygon.
import type { GeoStats } from '@/lib/types'

export default function GeoStatsBar({ stats }: { stats: GeoStats }) {
  const pctConPoligono =
    stats.total > 0 ? Math.round((stats.con_poligono / stats.total) * 100) : 0
  const pctValidadas =
    stats.con_poligono > 0
      ? Math.round((stats.validadas / stats.con_poligono) * 100)
      : 0

  return (
    <div className="flex items-stretch divide-x divide-slate-200 overflow-x-auto border-b border-slate-200 bg-white text-sm">
      <Stat label="Parcelas" value={stats.total} />
      <Stat
        label="Con polígono"
        value={`${stats.con_poligono} · ${pctConPoligono}%`}
        accent="#0ea5e9"
      />
      <Stat
        label="Validadas"
        value={`${stats.validadas} · ${pctValidadas}%`}
        accent="#22c55e"
      />
      <Stat
        label="Diferencia crítica"
        value={stats.diferencia_critica}
        accent="#ef4444"
      />
      <Stat label="Sin polígono" value={stats.sin_poligono} accent="#64748b" />
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: string
}) {
  return (
    <div className="flex shrink-0 basis-1/3 flex-col px-3 py-2 sm:basis-1/4 md:flex-1 md:basis-0 md:px-4">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className="text-lg font-semibold leading-tight"
        style={{ color: accent ?? '#0f172a' }}
      >
        {value}
      </span>
    </div>
  )
}
