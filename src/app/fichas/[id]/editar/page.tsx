// Reabrir una ficha guardada para corregirla (#1). Igual que la captura nueva,
// los catálogos los resuelve el cliente (caché local si no hay red); del
// servidor solo traemos lo que ya se respondió en esta ficha.
import { redirect, notFound } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getFichaDetalle } from '@/lib/data/fichas'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import FichaCaptureClient from '@/components/fichas/FichaCaptureClient'

export const dynamic = 'force-dynamic'

export default async function EditarFichaPage({
  params,
}: {
  params: { id: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />
  if (result.session.rol === 'solo_lectura') redirect(`/fichas/${params.id}`)

  const data = await getFichaDetalle(params.id)
  if (!data) notFound()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
      <div className="min-h-0 flex-1 overflow-auto">
        <FichaCaptureClient
          fichaEdicion={{
            id: data.ficha.id,
            tipo: data.ficha.tipo,
            template_id: data.template?.id ?? null,
            productor_id: data.productor_id,
            parcela_ids: data.parcelas.map((p) => p.id),
            fecha_inspeccion: data.ficha.fecha_inspeccion,
            respuestas: data.ficha.respuestas,
            estado: data.ficha.estado,
          }}
        />
      </div>
    </div>
  )
}
