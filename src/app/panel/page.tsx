// Panel de coordinación (Server Component): KPIs de TODAS las áreas.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getPanelStats } from '@/lib/data/panel'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import { ESTADO_FICHA_LABEL, type EstadoFicha } from '@/lib/types'
import { ESTADO_FICHA_BADGE } from '@/lib/ficha-workflow'
import { NIVEL_ORDEN, NIVEL_LABEL, NIVEL_BADGE } from '@/lib/certificacion/tipos'

export const dynamic = 'force-dynamic'

const n = (v: number, d = 0) => v.toLocaleString('es-MX', { maximumFractionDigits: d })

export default async function PanelPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const s = await getPanelStats()
  const pctGeo = s.parcelas > 0 ? Math.round((s.con_poligono / s.parcelas) * 100) : 0
  const pctVal = s.con_poligono > 0 ? Math.round((s.validadas / s.con_poligono) * 100) : 0
  const estados = Object.keys(ESTADO_FICHA_LABEL) as EstadoFicha[]
  const c = s.certificados
  const urgentes = c.vencido + c.critico

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} />
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Panel de coordinación</h1>
            <p className="text-sm text-slate-500">Resumen operativo de {result.session.orgNombre}</p>
          </div>

          {/* ALERTAS — lo primero que debe ver el coordinador */}
          {urgentes > 0 && (
            <Link href="/certificados" className="block">
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 transition hover:border-rose-400">
                <p className="text-sm font-semibold text-rose-800">
                  ⚠ Certificados que requieren atención
                </p>
                <p className="mt-1 text-sm text-rose-700">
                  {c.vencido > 0 && <b>{c.vencido} vencido{c.vencido === 1 ? '' : 's'}</b>}
                  {c.vencido > 0 && c.critico > 0 && ' · '}
                  {c.critico > 0 && `${c.critico} vence(n) en ≤30 días`}
                  {c.proximo > 0 && ` · ${c.proximo} en ≤90 días`}. Abrir Certificados →
                </p>
              </div>
            </Link>
          )}

          {/* Catálogos */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Kpi label="Productores" value={n(s.productores)} href="/productores" />
            <Kpi label="Parcelas" value={n(s.parcelas)} href="/productores" />
            <Kpi label="Hectáreas declaradas" value={`${n(s.hectareas, 1)} ha`} />
            <Kpi label="Bajas" value={n(s.bajas)} href="/certificacion" />
          </div>

          {/* Certificación SIC */}
          <Section
            title={`Certificación SIC${s.cert_anio ? ` · ${s.cert_anio}` : ''}`}
            href="/certificacion"
          >
            {s.cert_anio == null ? (
              <p className="text-sm text-slate-400">Aún no hay historial de certificación.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {NIVEL_ORDEN.map((nv) => (
                  <span key={nv} className={`rounded-full px-3 py-1 text-sm font-medium ${NIVEL_BADGE[nv]}`}>
                    {NIVEL_LABEL[nv]}: {s.cert_niveles[nv]}
                  </span>
                ))}
              </div>
            )}
          </Section>

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

          {/* Acopio */}
          <Section title={`Acopio · ${s.entradas} entradas`} href="/acopio">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Mini label="Pesadas" value={n(s.pesadas)} color="#0f172a" />
              <Mini label="Sacos acopiados" value={n(s.acopio_sacos)} color="#0f172a" />
              <Mini label="Kg netos" value={n(s.acopio_kg_netos, 1)} color="#ea580c" />
              <Mini label="Quintales" value={n(s.acopio_quintales, 2)} color="#0f172a" />
            </div>
          </Section>

          {/* Agroecología */}
          <Section title="Agroecología" href="/agroecologia">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
              <Mini label="Programas" value={s.agro_programas} color="#0f172a" />
              <Mini label="Comunidades" value={s.agro_comunidades} color="#0f172a" />
              <Mini label="Socios" value={n(s.agro_socios)} color="#0f172a" />
              <Mini label="Talleres" value={n(s.agro_talleres)} color="#0f172a" />
              <Mini label="Asistencias" value={n(s.agro_asistencias)} color="#0f172a" />
              <Mini
                label="% asistencia"
                value={`${Math.round(s.agro_pct_asistencia * 100)}%`}
                color="#ea580c"
              />
              <Mini
                label="Plantas · abono"
                value={`${n(s.agro_plantas)} · ${n(s.agro_abono, 2)} t`}
                color="#0f172a"
              />
            </div>
          </Section>

          {/* Estimación de cosecha */}
          <Section title="Estimación de cosecha" href="/estimacion">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Mini label="Estimaciones" value={n(s.estimaciones)} color="#0f172a" />
              <Mini label="Kg estimados" value={n(s.estimacion_kg, 1)} color="#ea580c" />
              <Mini label="Alimenta el LPA" value="Sí" color="#22c55e" />
            </div>
          </Section>

          {/* Fichas por estado */}
          <Section title={`Fichas de inspección (${s.fichas_total})`} href="/fichas">
            <div className="flex flex-wrap gap-2">
              {estados.map((e) => (
                <span key={e} className={`rounded-full px-3 py-1 text-sm font-medium ${ESTADO_FICHA_BADGE[e]}`}>
                  {ESTADO_FICHA_LABEL[e]}: {s.fichas_por_estado[e]}
                </span>
              ))}
              {s.fichas_total === 0 && <span className="text-sm text-slate-400">Aún no hay fichas.</span>}
            </div>
          </Section>

          {/* Certificados */}
          <Section title="Certificados (NOP · UE · LPO)" href="/certificados">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Mini label="Vencidos" value={c.vencido} color="#e11d48" />
              <Mini label="≤30 días" value={c.critico} color="#ea580c" />
              <Mini label="≤90 días" value={c.proximo} color="#d97706" />
              <Mini label="Vigentes" value={c.vigente} color="#22c55e" />
            </div>
          </Section>

          {/* Expediente técnico */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Kpi label="Bitácoras" value={n(s.bitacoras)} href="/bitacora" />
            <Kpi label="Historiales" value={n(s.historiales)} href="/historial" />
            <Kpi label="Generar LPA" value="↓ Excel" href="/lpa" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-orange-300">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{value}</div>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function Section({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
        <Link href={href} className="text-sm font-medium text-orange-600 hover:text-orange-700">
          Abrir →
        </Link>
      </div>
      {children}
    </section>
  )
}

function Mini({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  )
}
