// SIC — Certificación: padrón con nivel por año (espina del LPA). Server Component.
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getCertificacion } from '@/lib/data/certificacion'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import CertificacionTable from '@/components/certificacion/CertificacionTable'

export const dynamic = 'force-dynamic'

export default async function CertificacionPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const data = await getCertificacion()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Certificación (SIC)</h1>
            <p className="text-sm text-slate-500">
              Nivel por año (NUEVO → T1 → T2 → T3 → Orgánico) y bajas. Es la base del LPA.
            </p>
          </div>
          <CertificacionTable anios={data.anios} productores={data.productores} />
        </div>
      </div>
    </div>
  )
}
