// Captura de remisión en campo. El parseo y el guardado ocurren en el
// navegador (offline-first); esta página es sólo el marco.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import CapturaRemision from '@/components/remision/CapturaRemision'

export const dynamic = 'force-dynamic'

export default async function NuevaRemisionPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre}>
        <Link
          href="/acopio/remision"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          ← Remisiones
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-lg space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Nueva remisión</h1>
            <p className="text-sm text-slate-500">
              Marca el café del productor antes de que lo recoja el camión. Funciona sin señal.
            </p>
          </div>
          <CapturaRemision />
        </div>
      </div>
    </div>
  )
}
