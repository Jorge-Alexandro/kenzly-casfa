// Nueva lista de asistencia (Server Component + formulario).
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import NuevaListaForm from '@/components/asistencia/NuevaListaForm'

export const dynamic = 'force-dynamic'

export default async function NuevaListaPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <NuevaListaForm />
      </div>
    </div>
  )
}
