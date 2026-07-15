// Indicadores del módulo satelital, mismo formato que GeoStatsBar.
import type { SatStats } from '@/lib/satelite/indices'
import { fmtNdvi, colorNdvi, ALERTA_COLOR } from '@/lib/satelite/indices'

export default function SatStatsBar({ stats }: { stats: SatStats }) {
  const pctMonitoreadas =
    stats.con_poligono > 0
      ? Math.round((stats.monitoreadas / stats.con_poligono) * 100)
      : 0

  return (
    <div className="flex items-stretch divide-x divide-slate-200 overflow-x-auto border-b border-slate-200 bg-white text-sm">
      <Stat
        label="Monitoreadas"
        value={`${stats.monitoreadas} · ${pctMonitoreadas}%`}
        accent="#0ea5e9"
      />
      <Stat
        label="NDVI promedio"
        value={fmtNdvi(stats.ndvi_promedio)}
        accent={colorNdvi(stats.ndvi_promedio)}
      />
      <Stat
        label="Alertas activas"
        value={stats.alertas_activas}
        accent={ALERTA_COLOR.estres_hidrico}
      />
      <Stat label="Críticas" value={stats.criticas} accent={ALERTA_COLOR.critico} />
      <Stat label="Sin medición" value={stats.sin_datos} accent="#64748b" />
      <Stat
        label="Última imagen"
        value={stats.ultima_actualizacion ?? '—'}
      />
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
