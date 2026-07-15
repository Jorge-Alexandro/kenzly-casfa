// Detalle de una remisión: sus sacos, y la recepción en el beneficio.
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import Recibir from '@/components/remision/Recibir'
import { getRemision } from '@/lib/data/remision'

export const dynamic = 'force-dynamic'

export default async function RemisionPage({ params }: { params: { id: string } }) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const r = await getRemision(params.id)
  if (!r) notFound()

  const recibidos = r.sacos.filter((s) => s.recibido_at).length
  const faltantes = r.sacos.length - recibidos

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link
          href="/acopio/remision"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          ← Remisiones
        </Link>
        {r.entrada_id && (
          <Link
            href={`/acopio/${r.entrada_id}`}
            className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700"
          >
            Ver boleta
          </Link>
        )}
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              Remisión R-{r.folio}
              {r.estado === 'recibida' && (
                <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Recibida
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500">
              {r.proveedor_nombre} · {r.comunidad ?? '—'} · {r.fecha_remision}
            </p>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-500">Café</dt>
                <dd className="text-sm font-medium text-slate-800">
                  {r.especie} {r.tipo}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Saco</dt>
                <dd className="text-sm font-medium text-slate-800">{r.material_saco ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Sacos etiquetados</dt>
                <dd className="text-sm font-medium tabular-nums text-slate-800">
                  {r.sacos.length}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Kg declarados</dt>
                <dd className="text-sm font-medium tabular-nums text-slate-800">
                  {r.kg_declarado ?? '—'}
                </dd>
              </div>
            </dl>
            {r.observaciones && (
              <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
                {r.observaciones}
              </p>
            )}
          </section>

          {r.estado === 'en_campo' ? (
            <Recibir remisionId={r.id} folio={r.folio} sacos={r.sacos} />
          ) : (
            faltantes > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">
                  Llegaron {recibidos} de {r.sacos.length} sacos. Faltaron {faltantes} en el
                  traslado.
                </p>
              </div>
            )
          )}

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Sacos</h2>
            </div>
            <ul className="divide-y divide-slate-50">
              {r.sacos.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-2">
                  <span className="font-mono text-xs text-slate-700">
                    <span className="mr-2 text-slate-400">{s.orden}</span>
                    {s.codigo}
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      s.recibido_at ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {s.recibido_at ? 'Recibido' : 'En tránsito'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
