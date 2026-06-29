// Panel de coordinación (Server Component): KPIs de los 5 módulos.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getPanelStats } from '@/lib/data/panel'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import { ESTADO_FICHA_LABEL, type EstadoFicha } from '@/lib/types'
import { ESTADO_FICHA_BADGE } from '@/lib/ficha-workflow'

export const dynamic = 'force-dynamic'

export default async function PanelPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const s = await getPanelStats()
  const pctGeo = s.parcelas > 0 ? Math.round((s.con_poligono / s.parcelas) * 100) : 0
  const pctVal =
    s.con_poligono > 0 ? Math.round((s.validadas / s.con_poligono) * 100) : 0

  const estados = Object.keys(ESTADO_FICHA_LABEL) as EstadoFicha[]

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} />
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              Panel de coordinación
            </h1>
            <p className="text-sm text-slate-500">
              Resumen operativo de {result.session.orgNombre}
            </p>
          </div>

          {/* Catálogos */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Kpi label="Productores" value={s.productores} href="/productores" />
            <Kpi label="Parcelas" value={s.parcelas} href="/productores" />
            <Kpi
              label="Hectáreas declaradas"
              value={`${s.hectareas.toFixed(1)} ha`}
            />
          </div>

          {/* Cobertura geográfica */}
          <Section title="Cobertura geográfica (GeoSIC)" href="/geosic">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Mini label="Con polígono" value={`${s.con_poligono} · ${pctGeo}%`} color="#0ea5e9" />
              <Mini label="Validadas" value={`${s.validadas} · ${pctVal}%`} color="#22c55e" />
              <Mini label="Diferencia crítica" value={s.diferencia_critica} color="#ef4444" />
              <Mini label="Sin polígono" value={s.sin_poligono} color="#64748b" />
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${pctGeo}%` }} />
            </div>
          </Section>

          {/* Fichas por estado */}
          <Section title={`Fichas de inspección (${s.fichas_total})`} href="/fichas">
            <div className="flex flex-wrap gap-2">
              {estados.map((e) => (
                <span
                  key={e}
                  className={`rounded-full px-3 py-1 text-sm font-medium ${ESTADO_FICHA_BADGE[e]}`}
                >
                  {ESTADO_FICHA_LABEL[e]}: {s.fichas_por_estado[e]}
                </span>
              ))}
              {s.fichas_total === 0 && (
                <span className="text-sm text-slate-400">Aún no hay fichas.</span>
              )}
            </div>
          </Section>

          {/* Expediente técnico */}
          <div className="grid grid-cols-2 gap-4">
            <Kpi label="Bitácoras" value={s.bitacoras} href="/bitacora" />
            <Kpi label="Historiales" value={s.historiales} href="/historial" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  href,
}: {
  label: string
  value: string | number
  href?: string
}) {
  const inner = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-orange-300">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{value}</div>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function Section({
  title,
  href,
  children,
}: {
  title: string
  href: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
        <Link href={href} className="text-sm font-medium text-orange-600 hover:text-orange-700">
          Abrir →
        </Link>
      </div>
      {children}
    </section>
  )
}

function Mini({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color: string
}) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}
