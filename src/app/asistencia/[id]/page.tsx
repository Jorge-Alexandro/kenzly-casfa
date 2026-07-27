// Detalle de una lista de asistencia: registro en vivo + hoja imprimible.
import { redirect, notFound } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getListaAsistencia } from '@/lib/data/asistencia'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import ListaAsistenciaCliente from '@/components/asistencia/ListaAsistenciaCliente'

export const dynamic = 'force-dynamic'

export default async function ListaAsistenciaPage({
  params,
}: {
  params: { id: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const lista = await getListaAsistencia(params.id)
  if (!lista) notFound()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <div className="no-print">
        <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
      </div>
      <ListaAsistenciaCliente lista={lista} />
    </div>
  )
}
