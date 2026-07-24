// Contabilidad — captura de costo de las boletas (Server Component).
// Sólo admin/contador; el resto no llega aquí (y la RLS del costo los bloquea).
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getBoletasConCosto, getMaquilasCosto, fmtMXN, fmtNum } from '@/lib/data/contabilidad'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import TablaCostos from '@/components/contabilidad/TablaCostos'
import ResumenAlmacenes from '@/components/contabilidad/ResumenAlmacenes'

export const dynamic = 'force-dynamic'

export default async function ContabilidadPage() {
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

  const [boletas, maquilas] = await Promise.all([getBoletasConCosto(), getMaquilasCosto()])
  const maquilasConCosto = maquilas.filter((m) => m.boletas > 0)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={orgNombre} rol={rol} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Contabilidad — costo de boletas</h1>
            <p className="text-sm text-slate-500">
              Captura el precio por kilo de cada boleta. El importe se calcula solo. El área
              operativa no ve esta información.
            </p>
          </div>
          {/* Costo por maquila: importe de las boletas ÷ oro obtenido */}
          {maquilasConCosto.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Costo por maquila
                </h2>
                <p className="text-xs text-slate-400">
                  Costo por kilo de oro = importe de las boletas del corte ÷ kilos de oro obtenidos.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Corte</th>
                      <th className="px-3 py-2">Especie</th>
                      <th className="px-3 py-2 text-right">Boletas</th>
                      <th className="px-3 py-2 text-right">Importe</th>
                      <th className="px-3 py-2 text-right">Oro (kg)</th>
                      <th className="px-3 py-2 text-right">Costo/kg oro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {maquilasConCosto.map((m) => {
                      const faltan = m.boletas - m.boletas_con_precio
                      return (
                        <tr key={m.id}>
                          <td className="px-3 py-2 font-semibold text-slate-700">
                            {m.numero == null ? '—' : `MAQ. ${m.numero}`}
                            <span className="ml-1 text-xs font-normal text-slate-400">{m.fecha_corte}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{m.especie ?? '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                            {m.boletas_con_precio}/{m.boletas}
                            {faltan > 0 && (
                              <span className="ml-1 text-xs text-amber-600">· faltan {faltan}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
                            {fmtMXN(m.importe_total)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtNum(m.oro_kg, 1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-orange-700">
                            {m.costo_kg_oro == null ? '—' : fmtMXN(m.costo_kg_oro)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-2 text-xs text-slate-400">
                El costo por kilo sale completo cuando todas las boletas del corte tienen precio.
              </p>
            </section>
          )}

          {/* Reparto cooperativa FLO / CASFASA de las boletas de Chula Vista */}
          <ResumenAlmacenes boletas={boletas} />

          <TablaCostos boletas={boletas} />
        </div>
      </div>
    </div>
  )
}
