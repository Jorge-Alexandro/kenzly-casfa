// Agroecología — Estimación de cosecha: alta (Server Component carga catálogos).
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getReglas } from '@/lib/data/estimacion'
import { getProductoresLite } from '@/lib/data/acopio'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import EstimacionForm from '@/components/agroecologia/EstimacionForm'

export const dynamic = 'force-dynamic'

export default async function NuevaEstimacionPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const [reglas, productores] = await Promise.all([getReglas(), getProductoresLite()])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl">
          <EstimacionForm reglas={reglas} productores={productores} />
        </div>
      </div>
    </div>
  )
}
