// Contabilidad — captura de costo de las boletas (Server Component).
// Sólo admin/contador; el resto no llega aquí (y la RLS del costo los bloquea).
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getBoletasConCosto } from '@/lib/data/contabilidad'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import TablaCostos from '@/components/contabilidad/TablaCostos'

export const dynamic = 'force-dynamic'

export default async function ContabilidadPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const { rol, orgNombre } = result.session
  if (rol !== 'admin' && rol !== 'contador') {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
        <AppHeader orgNombre={orgNombre} rol={rol} />
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="rounded-xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-500">
            Esta sección es de Contabilidad.
          </p>
        </div>
      </div>
    )
  }

  const boletas = await getBoletasConCosto()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={orgNombre} rol={rol} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Contabilidad — costo de boletas</h1>
            <p className="text-sm text-slate-500">
              Captura el precio por kilo de cada boleta. El importe se calcula solo. El área
              operativa no ve esta información.
            </p>
          </div>
          <TablaCostos boletas={boletas} />
        </div>
      </div>
    </div>
  )
}
