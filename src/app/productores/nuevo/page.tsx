// Alta de productor nuevo (todos los roles: los inspectores también dan de
// alta en campo). Formulario con GPS y parcelas iniciales A/B/C.
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import NuevoProductorForm from '@/components/productores/NuevoProductorForm'

export const dynamic = 'force-dynamic'

export default async function NuevoProductorPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
      <div className="min-h-0 flex-1 overflow-auto">
        <NuevoProductorForm />
      </div>
    </div>
  )
}
