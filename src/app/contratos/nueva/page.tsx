// Módulo 8 — Contratos: alta (Server Component que carga catálogos).
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getPlantillas, getVendedores, getConfig } from '@/lib/data/contratos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import NuevoContrato from '@/components/contratos/NuevoContrato'

export const dynamic = 'force-dynamic'

export default async function NuevoContratoPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const [plantillas, productores, config] = await Promise.all([
    getPlantillas(),
    getVendedores(),
    getConfig(),
  ])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl">
          <NuevoContrato
            plantillas={plantillas}
            productores={productores}
            lugarFirma={config?.lugar_firma ?? null}
          />
        </div>
      </div>
    </div>
  )
}
