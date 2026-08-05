// Ventas — Requisiciones: el listado de órdenes internas de producción
// enviadas a torrefacción.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getRequisiciones } from '@/lib/data/ventas'
import { formatoNum } from '@/lib/ventas/tipos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import BotonBorrar from '@/components/BotonBorrar'

export const dynamic = 'force-dynamic'

export default async function RequisicionesPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const requisiciones = await getRequisiciones()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link href="/ventas" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          ← Ventas
        </Link>
        <Link href="/ventas/requisiciones/nueva" className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700">
          + Nueva requisición
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Requisiciones</h1>
            <p className="text-sm text-slate-500">
              La orden interna que le dice a torrefacción qué y cuánto hay que preparar. No afecta el
              inventario — es el papeleo de la solicitud.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Folio</th>
                  <th className="px-3 py-2.5">Fecha</th>
                  <th className="px-3 py-2.5">Cliente</th>
                  <th className="px-3 py-2.5 text-right">Productos</th>
                  <th className="px-3 py-2.5 text-right">Kg equivalentes</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requisiciones.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-mono font-semibold text-slate-700">{String(r.folio).padStart(4, '0')}</td>
                    <td className="px-3 py-2 text-slate-600">{r.fecha}</td>
                    <td className="px-3 py-2 text-slate-700">{r.cliente_nombre ?? r.cliente_texto ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{r.n_items}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatoNum(r.total_kg, 2)} kg</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-3">
                        <a
                          href={`/api/ventas/requisiciones/${r.id}/pdf`}
                          className="text-xs font-medium text-orange-700 hover:underline"
                        >
                          PDF ↓
                        </a>
                        <BotonBorrar
                          url={`/api/ventas/requisiciones/${r.id}`}
                          descripcion={`la requisición ${String(r.folio).padStart(4, '0')} del ${r.fecha}`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {requisiciones.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-400">
                Todavía no hay requisiciones. <Link href="/ventas/requisiciones/nueva" className="text-orange-700 hover:underline">Crea la primera</Link>.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
