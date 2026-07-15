// Lista de bitácoras (Server Component).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getBitacoras } from '@/lib/data/bitacora'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'

export const dynamic = 'force-dynamic'

export default async function BitacoraPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const bitacoras = await getBitacoras()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link
          href="/bitacora/nueva"
          className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600"
        >
          + Nueva bitácora
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl">
          {bitacoras.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
              <p className="text-sm text-slate-500">
                Aún no hay bitácoras. Crea la primera con “Nueva bitácora”.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Parcela</th>
                    <th className="px-4 py-2.5 font-medium">Productor</th>
                    <th className="px-4 py-2.5 text-right font-medium">Año</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {bitacoras.map((b) => (
                    <tr key={b.id} className="border-t border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-800">
                          {b.parcela_nombre || b.parcela_codigo}
                        </div>
                        <div className="text-xs text-slate-400">{b.parcela_codigo}</div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{b.productor_nombre}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {b.anio}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/bitacora/${b.id}`}
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
