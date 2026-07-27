// Listas de asistencia (índice).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getListasAsistencia } from '@/lib/data/asistencia'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'

export const dynamic = 'force-dynamic'

export default async function AsistenciaPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const listas = await getListasAsistencia()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link
          href="/asistencia/nueva"
          className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600"
        >
          + Nueva lista
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl">
          {listas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
              <p className="text-sm text-slate-500">
                Aún no hay listas de asistencia. Crea la primera con “Nueva lista”.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Folio</th>
                    <th className="px-4 py-2.5 font-medium">Evento</th>
                    <th className="px-4 py-2.5 font-medium">Fecha</th>
                    <th className="px-4 py-2.5 font-medium">Lugar</th>
                    <th className="px-4 py-2.5 text-right font-medium">Participantes</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {listas.map((l) => (
                    <tr key={l.id} className="border-t border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium tabular-nums text-slate-700">
                        #{l.folio}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        {l.nombre_evento}
                        {l.cerrada && (
                          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            cerrada
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{l.fecha}</td>
                      <td className="px-4 py-2.5 text-slate-600">{l.lugar ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                        {l.num_participantes}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/asistencia/${l.id}`}
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
