// GeoSIC — main module page (Server Component).
// Fetches data on the server (fast, secure, no token round-trips to the client)
// and passes plain serializable props down to the interactive map shell.
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getParcelasGeo, getParcelaPolygons } from '@/lib/data/geosic'
import { calcularStats } from '@/lib/types'
import GeoSICShell from '@/components/geosic/GeoSICShell'
import NoMembership from '@/components/geosic/NoMembership'

export const dynamic = 'force-dynamic' // siempre datos frescos por sesión

export default async function GeoSICPage() {
  const result = await getSessionResult()

  // Sin sesión -> al login. Con sesión pero sin organización -> mensaje claro
  // (NO redirigimos a /login: eso causaría un bucle con el middleware).
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const session = result.session

  // Fetch in parallel — both queries are independent.
  const [parcelas, polygons] = await Promise.all([
    getParcelasGeo(),
    getParcelaPolygons(),
  ])

  const stats = calcularStats(parcelas)

  return (
    <GeoSICShell
      session={session}
      parcelas={parcelas}
      polygons={polygons}
      stats={stats}
    />
  )
}
