// Módulo 8 — Contratos de fijación: lista (Server Component).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getContratos } from '@/lib/data/contratos'
import {
  CONTRATO_ESTADO_LABEL,
  CONTRATO_ESTADO_BADGE,
  fmtDinero,
  folioContrato,
} from '@/lib/contratos/tipos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'

export const dynamic = 'force-dynamic'

export default async function ContratosPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const contratos = await getContratos()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link
          href="/contratos/nueva"
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700"
        >
          + Nuevo contrato
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Contratos de fijación</h1>
            <p className="text-sm text-slate-500">
              {contratos.length} contrato{contratos.length === 1 ? '' : 's'} · compra de café al productor
            </p>
          </div>

          {contratos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-sm text-slate-500">Aún no hay contratos.</p>
              <Link
                href="/contratos/nueva"
                className="mt-3 inline-block rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
              >
                Crear el primero
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Folio</th>
                    <th className="px-3 py-2.5">Fecha</th>
                    <th className="px-3 py-2.5">Vendedor</th>
                    <th className="px-3 py-2.5">Producto</th>
                    <th className="px-3 py-2.5 text-right">Cantidad</th>
                    <th className="px-3 py-2.5 text-right">Importe</th>
                    <th className="px-3 py-2.5">Arbitraje</th>
                    <th className="px-3 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {contratos.map((c) => (
                    <tr key={c.id} className="transition hover:bg-orange-50/40">
                      <td className="px-3 py-2.5">
                        <Link href={`/contratos/${c.id}`} className="font-semibold text-orange-700">
                          {folioContrato(c.folio)}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{c.fecha}</td>
                      <td className="px-3 py-2.5">
                        <div className="max-w-[16rem] truncate font-medium text-slate-800">
                          {c.vendedor_nombre}
                        </div>
                        <div className="max-w-[16rem] truncate text-xs text-slate-400">
                          {[c.comunidad, c.municipio].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {c.especie} <span className="text-slate-400">{c.tipo}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        {Number(c.cantidad).toLocaleString('es-MX')} kg
                        {c.quintales != null && (
                          <div className="text-xs text-slate-400">
                            {Number(c.quintales).toLocaleString('es-MX', { maximumFractionDigits: 2 })} qq
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-800">
                        {fmtDinero(c.importe, c.moneda)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            c.arbitraje === 'internacional'
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {c.arbitraje === 'internacional' ? 'Internacional' : 'Nacional'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CONTRATO_ESTADO_BADGE[c.estado]}`}>
                          {CONTRATO_ESTADO_LABEL[c.estado]}
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
