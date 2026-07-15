// Módulo CRM — Resumen comercial (Server Component). El pipeline se agrega en
// servidor con los cálculos puros de lib/crm/calculos.mjs (UNA fuente, igual
// que Ventas). Ventas sigue siendo la verdad de ingresos: aquí solo se
// administra el proceso previo.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getOportunidades, getActividadesPendientes, getCuentas } from '@/lib/data/crm'
import { puedeEditarCRM } from '@/lib/crm/permisos'
import {
  resumenPipeline,
  actividadVencida,
  actividadProxima,
  cierreVencido,
  cierreProximo,
  sinSeguimiento,
} from '@/lib/crm/calculos.mjs'
import { ETAPAS, ETAPA_LABEL, ETAPA_BADGE } from '@/lib/crm/tipos'
import { formatoMXN } from '@/lib/ventas/tipos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import { fechaCorta } from '@/components/crm/ui'

export const dynamic = 'force-dynamic'

function TituloSeccion({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <div className="mb-4">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-800">
        <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" />
        {titulo}
      </h2>
      {subtitulo && <p className="mt-1 text-sm text-slate-500">{subtitulo}</p>}
    </div>
  )
}

export default async function CrmPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />
  const puedeEditar = puedeEditarCRM(result.session.rol)

  const [oportunidades, pendientes, cuentas] = await Promise.all([
    getOportunidades(),
    getActividadesPendientes(),
    getCuentas(),
  ])

  const resumen = resumenPipeline(oportunidades)
  const vencidas = pendientes.filter((a) => actividadVencida(a))
  const proximas = pendientes.filter((a) => actividadProxima(a))
  const cierresVencidos = oportunidades.filter((o) => cierreVencido(o))
  const cierresProximos = oportunidades.filter((o) => cierreProximo(o))

  // Última actividad por cuenta ya viene en getCuentas; para “sin seguimiento”
  // usamos la de la cuenta de cada oportunidad abierta.
  const ultimaPorCuenta = new Map(cuentas.map((c) => [c.id, c.ultima_actividad]))
  const abandonadas = oportunidades.filter((o) =>
    sinSeguimiento(o, o.cuenta ? ultimaPorCuenta.get(o.cuenta.id) ?? null : null),
  )

  const maxEtapa = Math.max(1, ...ETAPAS.map((e) => resumen.porEtapa[e]?.n ?? 0))

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link
          href="/crm/pipeline"
          className="hidden whitespace-nowrap rounded-md border border-orange-600 px-3 py-1.5 text-sm font-medium text-orange-700 transition hover:bg-orange-50 sm:block"
        >
          Pipeline
        </Link>
        <Link
          href="/crm/cuentas"
          className="whitespace-nowrap rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700"
        >
          Cuentas
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-800">CRM · Resumen comercial</h1>
              <p className="text-sm text-slate-500">
                {cuentas.length} cuenta{cuentas.length === 1 ? '' : 's'} · {resumen.abiertas} oportunidad
                {resumen.abiertas === 1 ? '' : 'es'} abierta{resumen.abiertas === 1 ? '' : 's'} · las ventas
                cerradas viven en el módulo Ventas
              </p>
            </div>
            {puedeEditar && (
              <div className="flex gap-2">
                <Link href="/crm/cuentas?nueva=1" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
                  + Cuenta
                </Link>
                <Link href="/crm/pipeline?nueva=1" className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700">
                  + Oportunidad
                </Link>
              </div>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Pipeline abierto</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-800">{formatoMXN(resumen.totalAbierto)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Valor ponderado</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-800">{formatoMXN(resumen.ponderado)}</p>
              <p className="text-[11px] text-slate-400">monto × probabilidad</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Oportunidades abiertas</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-800">{resumen.abiertas}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Actividades vencidas</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${vencidas.length > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                {vencidas.length}
              </p>
            </div>
          </div>

          {/* Pipeline por etapa */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <TituloSeccion
              titulo="Oportunidades por etapa"
              subtitulo="Distribución del pipeline; el detalle vive en el tablero."
            />
            <div className="space-y-2">
              {ETAPAS.map((e) => {
                const fila = resumen.porEtapa[e]
                const n = fila?.n ?? 0
                return (
                  <Link key={e} href="/crm/pipeline" className="flex items-center gap-3 rounded-md px-1 py-0.5 transition hover:bg-slate-50">
                    <span className={`w-28 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${ETAPA_BADGE[e]}`}>
                      {ETAPA_LABEL[e]}
                    </span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-orange-400"
                        style={{ width: `${(n / maxEtapa) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right text-sm tabular-nums text-slate-600">{n}</span>
                    <span className="hidden w-28 shrink-0 text-right font-mono text-xs tabular-nums text-slate-500 sm:block">
                      {formatoMXN(fila?.monto ?? 0)}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Actividades vencidas / próximas */}
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                Actividades vencidas {vencidas.length > 0 && <span className="text-rose-600">({vencidas.length})</span>}
              </h2>
              {vencidas.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-400">Nada vencido. Buen seguimiento. ✓</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {vencidas.slice(0, 8).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-slate-700">{a.asunto}</p>
                        {a.cuenta && (
                          <Link href={`/crm/cuentas/${a.cuenta.id}`} className="truncate text-xs text-orange-700 hover:underline">
                            {a.cuenta.nombre}
                          </Link>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-xs text-rose-600">{fechaCorta(a.fecha_programada)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                Próximas actividades (7 días)
              </h2>
              {proximas.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-400">Sin actividades programadas para esta semana.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {proximas.slice(0, 8).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-slate-700">{a.asunto}</p>
                        {a.cuenta && (
                          <Link href={`/crm/cuentas/${a.cuenta.id}`} className="truncate text-xs text-orange-700 hover:underline">
                            {a.cuenta.nombre}
                          </Link>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-xs text-slate-500">{fechaCorta(a.fecha_programada)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Alertas del pipeline */}
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                Cierres vencidos o cercanos
              </h2>
              {cierresVencidos.length === 0 && cierresProximos.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-400">Ninguna oportunidad cerca de su fecha de cierre.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {[...cierresVencidos, ...cierresProximos].slice(0, 8).map((o) => {
                    const vencida = cierreVencido(o)
                    return (
                      <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="truncate text-slate-700">{o.nombre}</p>
                          {o.cuenta && <p className="truncate text-xs text-slate-400">{o.cuenta.nombre}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`font-mono text-xs ${vencida ? 'font-semibold text-rose-600' : 'text-amber-600'}`}>
                            {fechaCorta(o.fecha_cierre_estimada)}{vencida ? ' · vencida' : ''}
                          </p>
                          <p className="font-mono text-xs tabular-nums text-slate-500">{formatoMXN(Number(o.monto_estimado))}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                Sin seguimiento reciente (14 días)
              </h2>
              {abandonadas.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-400">Todas las oportunidades abiertas tienen movimiento reciente.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {abandonadas.slice(0, 8).map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate text-slate-700">{o.nombre}</p>
                        {o.cuenta && (
                          <Link href={`/crm/cuentas/${o.cuenta.id}`} className="truncate text-xs text-orange-700 hover:underline">
                            {o.cuenta.nombre}
                          </Link>
                        )}
                      </div>
                      <span className="shrink-0 font-mono text-xs text-amber-600">últ. mov. {fechaCorta(o.updated_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
