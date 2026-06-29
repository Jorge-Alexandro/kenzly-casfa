// Nuevo historial: elegir parcela (Server Component + picker).
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getParcelasLite } from '@/lib/data/fichas'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import ParcelaPicker from '@/components/historial/ParcelaPicker'

export const dynamic = 'force-dynamic'

export default async function NuevoHistorialPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const parcelas = await getParcelasLite()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} />
      <div className="min-h-0 flex-1 overflow-auto">
        <ParcelaPicker parcelas={parcelas} />
      </div>
    </div>
  )
}
