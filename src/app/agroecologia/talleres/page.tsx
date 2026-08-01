// Agroecología — Listado de talleres impartidos (el evento).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getTalleres } from '@/lib/data/agro-talleres'
import { getProgramas } from '@/lib/data/agroecologia'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'

export const dynamic = 'force-dynamic'

export default async function TalleresPage({
  searchParams,
}: {
  searchParams: Promise<{ programa?: string; desde?: string; hasta?: string }>
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const sp = await searchParams
  const programas = await getProgramas()
  const programaId = sp.programa || null

  const talleres = await getTalleres({
    programaId,
    desde: sp.desde || null,
    hasta: sp.hasta || null,
  })

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams()
    if (programaId) p.set('programa', programaId)
    if (sp.desde) p.set('desde', sp.desde)
    if (sp.hasta) p.set('hasta', sp.hasta)
    for (const [k, v] of Object.entries(extra)) v ? p.set(k, v) : p.delete(k)
    return p.toString()
  }

  const fmt = (n: number | null) => (n == null ? '—' : String(n))

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link href="/agroecologia" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          ← Agroecología
        </Link>
        <Link href="/agroecologia/talleres/guia" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
          Guía
        </Link>
        <Link href="/agroecologia/plantillas" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
          Plantillas
        </Link>
        <Link href="/agroecologia/talleres/nuevo" className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700">
          + Nuevo taller
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Talleres</h1>
            <p className="text-sm text-slate-500">
              {talleres.length} taller{talleres.length === 1 ? '' : 'es'}. El reporte se arma solo de
              la plantilla del tipo + estos datos del evento.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
              <Link
                href={`/agroecologia/talleres?${qs({ programa: '' })}`}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${!programaId ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Todos
              </Link>
              {programas.map((p) => (
                <Link
                  key={p.id}
                  href={`/agroecologia/talleres?${qs({ programa: p.id })}`}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${programaId === p.id ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  {p.nombre}
                </Link>
              ))}
            </div>
            <form method="get" className="flex flex-wrap items-end gap-2">
              {programaId && <input type="hidden" name="programa" value={programaId} />}
              <label className="text-xs text-slate-500">
                <span className="mb-0.5 block">Desde</span>
                <input type="date" name="desde" defaultValue={sp.desde} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </label>
              <label className="text-xs text-slate-500">
                <span className="mb-0.5 block">Hasta</span>
                <input type="date" name="hasta" defaultValue={sp.hasta} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              </label>
              <button type="submit" className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700">
                Aplicar
              </button>
              {(sp.desde || sp.hasta) && (
                <Link href={`/agroecologia/talleres?${qs({ desde: '', hasta: '' })}`} className="rounded-md border border-slate-300 px-2.5 py-2 text-xs text-slate-600 hover:bg-white">
                  Todo el histórico
                </Link>
              )}
            </form>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Fecha</th>
                  <th className="px-3 py-2.5">Tipo de taller</th>
                  <th className="px-3 py-2.5">Comunidad</th>
                  <th className="px-3 py-2.5">Técnico</th>
                  <th className="px-3 py-2.5 text-right">Asistentes</th>
                  <th className="px-3 py-2.5 text-right">Fotos</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {talleres.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 text-slate-600">{t.fecha}</td>
                    <td className="px-3 py-2 text-slate-800">
                      {t.tipo_nombre}
                      {t.historico && (
                        <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">histórico</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {t.comunidad}
                      {t.municipio && <span className="text-slate-400"> · {t.municipio}</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{t.tecnico ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmt(t.n_asistentes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{t.n_fotos || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/agroecologia/talleres/${t.id}`} className="text-xs font-medium text-orange-700 hover:underline">
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {talleres.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Ningún taller con ese filtro.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
