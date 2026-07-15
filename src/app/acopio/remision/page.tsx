// Remisiones de campo: qué salió, qué llegó, y qué falta.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import { getRemisiones } from '@/lib/data/remision'

export const dynamic = 'force-dynamic'

const num = (n: number | null, dec = 1) =>
  n == null
    ? '—'
    : Number(n).toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec })

export default async function RemisionesPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const remisiones = await getRemisiones()
  const enCampo = remisiones.filter((r) => r.estado === 'en_campo')
  const conFaltante = remisiones.filter((r) => r.estado === 'recibida' && r.sacos_faltantes > 0)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre}>
        <Link
          href="/acopio"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          ← Acopio
        </Link>
        <Link
          href="/acopio/remision/etiquetas"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          Etiquetas
        </Link>
        <Link
          href="/acopio/remision/nueva"
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700"
        >
          + Nueva remisión
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Remisiones de campo</h1>
            <p className="text-sm text-slate-500">
              {remisiones.length} remisiones · {enCampo.length} en tránsito
              {conFaltante.length > 0 && (
                <span className="text-red-700">
                  {' '}
                  · {conFaltante.length} llegaron incompletas
                </span>
              )}
            </p>
          </div>

          {remisiones.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm text-slate-600">
                Todavía no hay remisiones. Empieza imprimiendo etiquetas.
              </p>
              <Link
                href="/acopio/remision/etiquetas"
                className="mt-3 inline-block rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700"
              >
                Imprimir etiquetas
              </Link>
            </div>
          ) : (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Folio</th>
                      <th className="px-3 py-2 font-medium">Fecha</th>
                      <th className="px-3 py-2 font-medium">Productor</th>
                      <th className="px-3 py-2 font-medium">Café</th>
                      <th className="px-3 py-2 text-right font-medium">Sacos</th>
                      <th className="px-3 py-2 text-right font-medium">Recibidos</th>
                      <th className="px-3 py-2 text-right font-medium">Kg declarados</th>
                      <th className="px-3 py-2 text-right font-medium">Kg pesados</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {remisiones.map((r) => (
                      <tr key={r.remision_id} className="border-t border-slate-50">
                        <td className="px-3 py-2">
                          <Link
                            href={`/acopio/remision/${r.remision_id}`}
                            className="font-semibold text-orange-700"
                          >
                            R-{r.folio}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{r.fecha_remision}</td>
                        <td className="px-3 py-2">
                          <p className="text-slate-800">{r.proveedor_nombre}</p>
                          <p className="text-slate-400">{r.comunidad ?? '—'}</p>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {r.especie} {r.tipo}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {r.sacos_etiquetados}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.estado === 'recibida' ? (
                            <span
                              className={
                                r.sacos_faltantes > 0
                                  ? 'font-semibold text-red-700'
                                  : 'text-slate-700'
                              }
                            >
                              {r.sacos_recibidos}
                              {r.sacos_faltantes > 0 && ` (faltan ${r.sacos_faltantes})`}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                          {num(r.kg_declarado)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                          {num(r.kg_pesados)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              r.estado === 'recibida'
                                ? 'bg-emerald-50 text-emerald-700'
                                : r.estado === 'cancelada'
                                  ? 'bg-slate-100 text-slate-500'
                                  : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {r.estado === 'recibida'
                              ? `Boleta ${r.boleta_folio ?? '—'}`
                              : r.estado === 'cancelada'
                                ? 'Cancelada'
                                : 'En tránsito'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
