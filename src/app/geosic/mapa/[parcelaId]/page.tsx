// Mapa imprimible de una parcela (Server Component).
import { redirect, notFound } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getMapaParcela } from '@/lib/data/mapa'
import MapaParcelaReport from '@/components/geosic/MapaParcelaReport'

export const dynamic = 'force-dynamic'

export default async function MapaParcelaPage({
  params,
}: {
  params: { parcelaId: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') redirect('/login')

  const data = await getMapaParcela(params.parcelaId)
  if (!data) notFound()

  return (
    <MapaParcelaReport
      data={data}
      token={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''}
    />
  )
}
