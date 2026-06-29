// Nueva ficha. La captura está pensada para CAMPO/OFFLINE: los catálogos los
// carga el cliente desde el caché local (IndexedDB) cuando no hay red. Por eso
// NO los traemos en el servidor — el cliente usa obtenerCatalogos().
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import FichaCaptureClient from '@/components/fichas/FichaCaptureClient'

export const dynamic = 'force-dynamic'

export default async function NuevaFichaPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} />
      <div className="min-h-0 flex-1 overflow-auto">
        <FichaCaptureClient />
      </div>
    </div>
  )
}
