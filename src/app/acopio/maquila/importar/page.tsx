// Módulo Maquila — Importar los formatos que entrega el encargado del acopio.
// Server Component shell; el parseo del .xlsx ocurre en el navegador dentro de
// ImportarFormatos, y el servidor re-parsea al guardar.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import ImportarFormatos from '@/components/maquila/ImportarFormatos'

export const dynamic = 'force-dynamic'

export default async function ImportarMaquilaPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link
          href="/acopio/maquila"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          ← Maquila
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Importar formatos de acopio</h1>
            <p className="text-sm text-slate-500">
              Los cortes de maquila, los repasos y los inventarios de materia prima. Se revisan los
              cuadres de sacos y kilos antes de guardar, y las boletas se enlazan solas con las
              entradas del acopio por su folio.
            </p>
          </div>
          <ImportarFormatos />
        </div>
      </div>
    </div>
  )
}
