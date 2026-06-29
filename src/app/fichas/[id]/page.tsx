// Ficha detail + printable report (Server Component).
import { redirect, notFound } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getFichaDetalle } from '@/lib/data/fichas'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import FichaReport from '@/components/fichas/FichaReport'

export const dynamic = 'force-dynamic'

export default async function FichaDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const data = await getFichaDetalle(params.id)
  if (!data) notFound()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <div className="no-print">
        <AppHeader orgNombre={result.session.orgNombre} />
      </div>
      <FichaReport data={data} rol={result.session.rol} />
    </div>
  )
}
