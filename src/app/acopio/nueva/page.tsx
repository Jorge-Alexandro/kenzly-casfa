// Módulo 4 — Acopio: alta de entrada (Server Component que carga catálogos).
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getProductosCatalogo, getAcopioProveedores } from '@/lib/data/acopio'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import NuevaEntradaForm from '@/components/acopio/NuevaEntradaForm'

export const dynamic = 'force-dynamic'

export default async function NuevaEntradaPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const [catalogo, productores] = await Promise.all([
    getProductosCatalogo(),
    getAcopioProveedores(),
  ])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl">
          <NuevaEntradaForm catalogo={catalogo} productores={productores} />
        </div>
      </div>
    </div>
  )
}
