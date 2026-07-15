// Lista de historiales por parcela (Server Component).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getParcelasConHistorial } from '@/lib/data/historial'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import { codigoCorto } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function HistorialPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const parcelas = await getParcelasConHistorial()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link
          href="/historial/nueva"
          className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600"
        >
          + Nuevo historial
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl">
          {parcelas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
              <p className="text-sm text-slate-500">
                Aún no hay historiales. Crea el primero con “Nuevo historial”.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Parcela</th>
                    <th className="px-4 py-2.5 font-medium">Productor</th>
                    <th className="px-4 py-2.5 font-medium">Años</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {parcelas.map((p) => (
                    <tr key={p.parcela_id} className="border-t border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-800">
                          {p.parcela_nombre || codigoCorto(p.parcela_codigo, p.parcela_nombre)}
                        </div>
                        <div className="text-xs text-slate-400">
                          {codigoCorto(p.parcela_codigo, p.parcela_nombre)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{p.productor_nombre}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {p.anios.sort((a, b) => a - b).join(', ')}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/historial/${p.parcela_id}`}
                          className="text-sm font-medium text-orange-600 hover:text-orange-700"
                        >
                          Abrir →
                        </Link>
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
