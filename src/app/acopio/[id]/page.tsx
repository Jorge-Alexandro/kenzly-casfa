// Módulo 4 — Acopio: detalle de entrada con sus pesadas (Server Component).
import { redirect, notFound } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getEntrada, getProductosCatalogo, getTaraConfig } from '@/lib/data/acopio'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import EntradaDetalle from '@/components/acopio/EntradaDetalle'

export const dynamic = 'force-dynamic'

export default async function EntradaPage({ params }: { params: { id: string } }) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const [entrada, catalogo, tara] = await Promise.all([
    getEntrada(params.id),
    getProductosCatalogo(),
    getTaraConfig(),
  ])
  if (!entrada) notFound()

  // Producto de esta entrada: trae el factor de quintal (cálculo en vivo de la
  // pesada) y las bases y normas de la muestra (análisis de calidad).
  const producto =
    catalogo.find((c) => c.especie === entrada.especie && c.tipo === entrada.tipo) ?? null

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl">
          <EntradaDetalle
            entrada={entrada}
            tara={tara}
            producto={producto}
            rol={result.session.rol}
          />
        </div>
      </div>
    </div>
  )
}
