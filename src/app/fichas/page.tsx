// Lista de fichas (Server Component).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getFichas } from '@/lib/data/fichas'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import {
  TIPO_FICHA_LABEL,
  ESTADO_FICHA_LABEL,
  type EstadoFicha,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

const ESTADO_COLOR: Record<EstadoFicha, string> = {
  borrador: 'bg-slate-100 text-slate-600',
  en_revision: 'bg-amber-100 text-amber-700',
  aprobada: 'bg-green-100 text-green-700',
  pdf_generado: 'bg-sky-100 text-sky-700',
  requiere_correccion: 'bg-red-100 text-red-700',
}

export default async function FichasPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const fichas = await getFichas()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre}>
        <Link
          href="/fichas/nueva"
          className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600"
        >
          + Nueva ficha
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-5xl">
          {fichas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
              <p className="text-sm text-slate-500">
                Aún no hay fichas. Crea la primera con “Nueva ficha”.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Tipo</th>
                    <th className="px-4 py-2.5 font-medium">Productor</th>
                    <th className="px-4 py-2.5 text-right font-medium">Parcelas</th>
                    <th className="px-4 py-2.5 text-right font-medium">Área</th>
                    <th className="px-4 py-2.5 font-medium">Fecha</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {fichas.map((f) => (
                    <tr
                      key={f.id}
                      className="border-t border-slate-50 hover:bg-slate-50"
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        {TIPO_FICHA_LABEL[f.tipo]}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-slate-800">{f.productor_nombre}</div>
                        <div className="text-xs text-slate-400">
                          {f.productor_codigo}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                        {f.num_parcelas}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                        {f.area_cultivada_ha !== null
                          ? `${Number(f.area_cultivada_ha).toFixed(2)} ha`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {f.fecha_inspeccion ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_COLOR[f.estado]}`}
                        >
                          {ESTADO_FICHA_LABEL[f.estado]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/fichas/${f.id}`}
                          className="text-sm font-medium text-orange-600 hover:text-orange-700"
                        >
                          Ver →
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
