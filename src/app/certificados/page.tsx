// Certificados — vencimientos y alertas por programa/esquema.
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getCertificados } from '@/lib/data/certificados'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import CertificadosTable from '@/components/certificados/CertificadosTable'

export const dynamic = 'force-dynamic'

export default async function CertificadosPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const certificados = await getCertificados()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Certificados</h1>
            <p className="text-sm text-slate-500">
              Vencimientos por programa y esquema (NOP USDA · UE · LPO), con alertas.
            </p>
          </div>
          {certificados.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              No hay certificados cargados. Corre la migración{' '}
              <code className="text-xs">0016_certificados.sql</code>.
            </div>
          ) : (
            <CertificadosTable certificados={certificados} />
          )}
        </div>
      </div>
    </div>
  )
}
