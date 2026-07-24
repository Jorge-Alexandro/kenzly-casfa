// Gastos por programa (Emily y Francisco) — Server Component.
// Sólo admin/contador; la RLS de las tablas de gasto respalda el candado.
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getProgramas, getGastos } from '@/lib/data/gastos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import PanelGastos from '@/components/gastos/PanelGastos'

export const dynamic = 'force-dynamic'

export default async function GastosPage() {
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

  const [programas, gastos] = await Promise.all([getProgramas(), getGastos({})])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={orgNombre} rol={rol} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Gastos por programa</h1>
            <p className="text-sm text-slate-500">
              Captura cada movimiento con su fecha y categoría; la matriz y los totales se arman
              solos. El área operativa no ve esta información.
            </p>
          </div>
          <PanelGastos programas={programas} gastosIniciales={gastos} />
        </div>
      </div>
    </div>
  )
}
