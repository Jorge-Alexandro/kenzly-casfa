// Agroecología — tablero de KPIs + matriz de avances por programa.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getProgramas, getMatriz } from '@/lib/data/agroecologia'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import AgroMatriz from '@/components/agroecologia/AgroMatriz'

export const dynamic = 'force-dynamic'

export default async function AgroecologiaPage({
  searchParams,
}: {
  searchParams: { programa?: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const programas = await getProgramas()
  const seleccion = searchParams.programa ?? programas[0]?.id ?? null
  const matriz = seleccion ? await getMatriz(seleccion) : null

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Agroecología</h1>
              <p className="text-sm text-slate-500">
                Talleres, asistencia por comunidad y KPIs del centro.
              </p>
            </div>
            {programas.length > 0 && (
              <div className="flex gap-1.5">
                {programas.map((p) => (
                  <Link
                    key={p.id}
                    href={`/agroecologia?programa=${p.id}`}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      p.id === seleccion
                        ? 'bg-orange-600 text-white'
                        : 'bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {p.nombre} <span className="opacity-70">{p.ciclo}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {!matriz ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              No hay programas cargados todavía. Corre la migración 0013 e importa los avances
              (<code className="text-xs">scripts/import-avances.py --commit</code>).
            </div>
          ) : (
            <AgroMatriz matriz={matriz} />
          )}
        </div>
      </div>
    </div>
  )
}
