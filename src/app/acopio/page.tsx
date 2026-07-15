// Módulo 4 — Acopio: lista de entradas (Server Component).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import {
  getEntradas,
  getProductosCatalogo,
  ESTADO_ENTRADA_LABEL,
  ESTADO_ENTRADA_BADGE,
} from '@/lib/data/acopio'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import ExportAcopio from '@/components/acopio/ExportAcopio'

export const dynamic = 'force-dynamic'

export default async function AcopioPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const [entradas, catalogo] = await Promise.all([getEntradas(), getProductosCatalogo()])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link
          href="/acopio/remision"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          Remisiones
        </Link>
        <Link
          href="/acopio/maquila"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          Maquila
        </Link>
        <Link
          href="/acopio/nueva"
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700"
        >
          + Nueva entrada
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Acopio</h1>
              <p className="text-sm text-slate-500">
                {entradas.length} entrada{entradas.length === 1 ? '' : 's'} · recepción de café y cacao
              </p>
            </div>
            {entradas.length > 0 && <ExportAcopio catalogo={catalogo} />}
          </div>

          {entradas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-sm text-slate-500">Aún no hay entradas registradas.</p>
              <Link
                href="/acopio/nueva"
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
                    <th className="px-3 py-2.5">Folio</th>
                    <th className="px-3 py-2.5">Fecha</th>
                    <th className="px-3 py-2.5">Proveedor</th>
                    <th className="px-3 py-2.5">Producto</th>
                    <th className="px-3 py-2.5 text-right">Sacos</th>
                    <th className="px-3 py-2.5 text-right">Kg netos</th>
                    <th className="px-3 py-2.5 text-right">Quintales</th>
                    <th className="px-3 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entradas.map((e) => (
                    <tr key={e.id} className="transition hover:bg-orange-50/40">
                      <td className="px-3 py-2.5">
                        <Link href={`/acopio/${e.id}`} className="font-semibold text-orange-700">
                          #{e.folio}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{e.fecha_acopio}</td>
                      <td className="px-3 py-2.5">
                        <div className="max-w-[16rem] truncate font-medium text-slate-800">
                          {e.proveedor_nombre}
                        </div>
                        <div className="max-w-[16rem] truncate text-xs text-slate-400">
                          {[e.comunidad, e.municipio].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {e.especie} <span className="text-slate-400">{e.tipo}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        {e.total_sacos}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        {Number(e.kg_netos).toLocaleString('es-MX', { maximumFractionDigits: 1 })}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        {e.quintales == null
                          ? <span className="text-slate-400">N/A</span>
                          : Number(e.quintales).toLocaleString('es-MX', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_ENTRADA_BADGE[e.estado]}`}>
                          {ESTADO_ENTRADA_LABEL[e.estado]}
                        </span>
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
