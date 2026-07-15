// Agroecología — Estimación de cosecha: lista (Server Component).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getEstimaciones } from '@/lib/data/estimacion'
import { METODO_LABEL } from '@/lib/agroecologia/tipos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'

export const dynamic = 'force-dynamic'

export default async function EstimacionPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const filas = await getEstimaciones()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link
          href="/estimacion/nueva"
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700"
        >
          + Nueva estimación
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Estimación de cosecha</h1>
            <p className="text-sm text-slate-500">
              {filas.length} estimaci{filas.length === 1 ? 'ón' : 'ones'} · alimenta el LPA y los inventarios de Agroecología
            </p>
          </div>

          {filas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-sm text-slate-500">Aún no hay estimaciones.</p>
              <Link
                href="/estimacion/nueva"
                className="mt-3 inline-block rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
              >
                Registrar la primera
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Fecha</th>
                    <th className="px-3 py-2.5">Productor</th>
                    <th className="px-3 py-2.5">Parcela</th>
                    <th className="px-3 py-2.5">Ciclo</th>
                    <th className="px-3 py-2.5">Método</th>
                    <th className="px-3 py-2.5 text-right">Kg estimado</th>
                    <th className="px-3 py-2.5 text-right">Kg final</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filas.map((f) => (
                    <tr key={f.id} className="hover:bg-orange-50/40">
                      <td className="px-3 py-2.5 text-slate-600">{f.fecha}</td>
                      <td className="px-3 py-2.5">
                        <div className="max-w-[14rem] truncate font-medium text-slate-800">
                          {f.proveedor_nombre ?? '—'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {f.parcela_nombre ?? f.parcela_codigo ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{f.ciclo}</td>
                      <td className="px-3 py-2.5 text-slate-600">{METODO_LABEL[f.metodo]}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        {f.kg_estimado == null ? '—' : Number(f.kg_estimado).toLocaleString('es-MX', { maximumFractionDigits: 1 })}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-800">
                        {f.valor_final_kg == null ? '—' : Number(f.valor_final_kg).toLocaleString('es-MX', { maximumFractionDigits: 1 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
