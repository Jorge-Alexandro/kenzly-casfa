// Modulo 2 — Dashboard de productores (Server Component).
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getProductoresDashboard } from '@/lib/data/geosic'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import ProductoresTable from '@/components/productores/ProductoresTable'

export const dynamic = 'force-dynamic'

export default async function ProductoresPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const productores = await getProductoresDashboard()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} />
      <ProductoresTable productores={productores} />
    </div>
  )
}
