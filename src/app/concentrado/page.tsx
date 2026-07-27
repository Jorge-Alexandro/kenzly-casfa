// Concentrado de acopio (el reporte de Francisco) — Server Component.
// QQ acopiados por mes y tipo de café + reparto por cooperativa, con su
// equivalente en lotes. Sólo admin/contador: lleva importes.
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import {
  getConcentrado, armarQQAcopiados, armarCooperativas,
  fmtMXN, fmtNum, LOTE_QQ,
} from '@/lib/data/concentrado'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import QQAcopiadosTabs from '@/components/concentrado/QQAcopiadosTabs'

export const dynamic = 'force-dynamic'

export default async function ConcentradoPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const { rol, orgNombre } = result.session
  if (rol !== 'admin' && rol !== 'contador') {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
        <AppHeader orgNombre={orgNombre} rol={rol} />
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-500">
            Esta sección es de Contabilidad.
          </p>
        </div>
      </div>
    )
  }

  const sp = await searchParams
  const desde = sp.desde || ''
  const hasta = sp.hasta || ''

  const boletas = await getConcentrado({ desde: desde || null, hasta: hasta || null })
  const qq = armarQQAcopiados(boletas)
  const coops = armarCooperativas(boletas)

  const qs = new URLSearchParams()
  if (desde) qs.set('desde', desde)
  if (hasta) qs.set('hasta', hasta)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={orgNombre} rol={rol} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Concentrado de acopio</h1>
            <p className="text-sm text-slate-500">
              Quintales acopiados por mes y tipo de café, y cuánto puso cada cooperativa. Un lote
              de exportación son {LOTE_QQ} qq.
            </p>
          </div>

          {/* Periodo + descarga */}
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-500">
              <span className="mb-0.5 block">Desde</span>
              <input type="date" name="desde" defaultValue={desde} className={INPUT} />
            </label>
            <label className="text-xs text-slate-500">
              <span className="mb-0.5 block">Hasta</span>
              <input type="date" name="hasta" defaultValue={hasta} className={INPUT} />
            </label>
            <button type="submit"
              className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700">
              Aplicar
            </button>
            {(desde || hasta) && (
              <a href="/concentrado"
                className="rounded-md border border-slate-300 px-2.5 py-2 text-xs text-slate-600 hover:bg-white">
                Todo el acopio
              </a>
            )}
            <a href={`/api/concentrado/export?${qs.toString()}`}
              className="ml-auto rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800">
              Descargar Excel
            </a>
          </form>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Caja label="Boletas" value={String(boletas.length)} />
            <Caja label="Quintales acopiados" value={fmtNum(qq.total.qq, 2)} destacado />
            <Caja label="Equivalente en lotes" value={fmtNum(qq.total.qq / LOTE_QQ, 2)} />
            <Caja label="Importe" value={fmtMXN(qq.total.importe)} />
          </div>

          {/* ── QQ acopiados: pestañas por tipo de café ── */}
          <QQAcopiadosTabs data={qq} />

          {/* ── Cooperativas ── */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Acopio por cooperativa
              </h2>
              <p className="text-xs text-slate-400">
                Las sociedades (persona moral) se listan una por una; los socios individuales suman
                en un solo renglón. Lote = {LOTE_QQ} qq.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Sociedad</th>
                    <th className="px-3 py-2 text-right">Boletas</th>
                    <th className="px-3 py-2 text-right">Café kg</th>
                    <th className="px-3 py-2 text-right">Café QQ</th>
                    <th className="px-3 py-2 text-right">Lotes</th>
                    <th className="border-l border-slate-200 px-3 py-2 text-right">Cacao kg</th>
                    <th className="px-3 py-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {coops.sociedades.map((s, i) => (
                    <tr key={s.nombre}>
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      <td className="px-3 py-2 text-slate-800">{s.nombre}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{s.boletas}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtNum(s.cafe_kg, 2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{fmtNum(s.cafe_qq, 2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-orange-700">{fmtNum(s.lotes, 2)}</td>
                      <td className="border-l border-slate-100 px-3 py-2 text-right tabular-nums text-amber-700">
                        {s.cacao_kg > 0.005 ? fmtNum(s.cacao_kg, 2) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtMXN(s.importe)}</td>
                    </tr>
                  ))}
                  <tr className="bg-sky-50/60">
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 font-medium text-sky-900">{coops.individuales.nombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-700">{coops.individuales.boletas}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-800">{fmtNum(coops.individuales.cafe_kg, 2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-sky-900">{fmtNum(coops.individuales.cafe_qq, 2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-800">{fmtNum(coops.individuales.lotes, 2)}</td>
                    <td className="border-l border-sky-100 px-3 py-2 text-right tabular-nums text-amber-700">
                      {coops.individuales.cacao_kg > 0.005 ? fmtNum(coops.individuales.cacao_kg, 2) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-800">{fmtMXN(coops.individuales.importe)}</td>
                  </tr>
                </tbody>
                <tfoot className="bg-slate-50 font-semibold text-slate-700">
                  <tr>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">TOTAL ACOPIO</td>
                    <td className="px-3 py-2 text-right tabular-nums">{coops.total.boletas}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(coops.total.cafe_kg, 2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(coops.total.cafe_qq, 2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(coops.total.lotes, 2)}</td>
                    <td className="border-l border-slate-200 px-3 py-2 text-right tabular-nums text-amber-700">{fmtNum(coops.total.cacao_kg, 2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMXN(coops.total.importe)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

const INPUT = 'rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800'

function Caja({ label, value, destacado }: { label: string; value: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destacado ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}>
      <div className={`text-xs ${destacado ? 'text-orange-800' : 'text-slate-500'}`}>{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${destacado ? 'text-orange-700' : 'text-slate-800'}`}>
        {value}
      </div>
    </div>
  )
}
