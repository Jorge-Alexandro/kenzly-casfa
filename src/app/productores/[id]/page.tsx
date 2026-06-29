// Productor detail page (Server Component).
import { redirect, notFound } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getProductorDetalle } from '@/lib/data/productores'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import ProductorDetalle from '@/components/productores/ProductorDetalle'

export const dynamic = 'force-dynamic'

export default async function ProductorDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const data = await getProductorDetalle(params.id)
  if (!data) notFound()

  const puedeEditar =
    result.session.rol === 'admin' || result.session.rol === 'coordinador'

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} />
      <ProductorDetalle data={data} puedeEditar={puedeEditar} />
    </div>
  )
}
