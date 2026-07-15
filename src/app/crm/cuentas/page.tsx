// CRM — Cuentas comerciales (Server Component: carga; buscador/filtros/alta
// viven en CuentasLista). ?nueva=1 abre el modal de alta de prospecto.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getCuentas, getMiembrosOrg } from '@/lib/data/crm'
import { puedeEditarCRM } from '@/lib/crm/permisos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import CuentasLista from '@/components/crm/CuentasLista'

export const dynamic = 'force-dynamic'

export default async function CuentasPage({
  searchParams,
}: {
  searchParams?: { nueva?: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />
  const puedeEditar = puedeEditarCRM(result.session.rol)

  const [cuentas, miembros] = await Promise.all([getCuentas(), getMiembrosOrg()])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre}>
        <Link
          href="/crm"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          ← CRM
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Cuentas comerciales</h1>
            <p className="text-sm text-slate-500">
              Prospectos y clientes. Un prospecto no necesita RFC — el cliente fiscal se vincula al formalizarse.
            </p>
          </div>
          <CuentasLista
            cuentas={cuentas}
            miembros={miembros}
            puedeEditar={puedeEditar}
            abrirNueva={searchParams?.nueva === '1' && puedeEditar}
          />
        </div>
      </div>
    </div>
  )
}
