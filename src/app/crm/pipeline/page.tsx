// CRM — Tablero Kanban del pipeline (Server Component: carga datos; la
// interacción vive en PipelineBoard). ?nueva=1 abre el modal de alta.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getOportunidades, getCuentas, getMiembrosOrg } from '@/lib/data/crm'
import { getClientes, getProductos } from '@/lib/data/ventas'
import { puedeEditarCRM } from '@/lib/crm/permisos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import PipelineBoard from '@/components/crm/PipelineBoard'

export const dynamic = 'force-dynamic'

export default async function PipelinePage({
  searchParams,
}: {
  searchParams?: { nueva?: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />
  const puedeEditar = puedeEditarCRM(result.session.rol)

  const [oportunidades, cuentas, miembros, productos, clientesFiscales] = await Promise.all([
    getOportunidades(),
    getCuentas(),
    getMiembrosOrg(),
    getProductos(),
    getClientes(),
  ])

  const cuentasVinculadas: Record<string, boolean> = {}
  for (const c of cuentas) cuentasVinculadas[c.id] = c.ventas_cliente_id !== null

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
        <div className="mx-auto max-w-7xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Pipeline comercial</h1>
            <p className="text-sm text-slate-500">
              Prospecto → Contactado → Calificado → Cotización → Negociación → Ganado/Perdido.
              Ganar una oportunidad no registra la venta: eso sigue en el módulo Ventas.
            </p>
          </div>
          <PipelineBoard
            oportunidades={oportunidades}
            cuentas={cuentas.map((c) => ({ id: c.id, nombre: c.nombre }))}
            productos={productos.map((p) => ({ id: p.id, nombre: p.nombre, linea: p.linea, unidad: p.unidad }))}
            miembros={miembros}
            clientesFiscales={clientesFiscales.map((c) => ({ id: c.id, rfc: c.rfc, nombre: c.nombre }))}
            cuentasVinculadas={cuentasVinculadas}
            puedeEditar={puedeEditar}
            abrirNueva={searchParams?.nueva === '1' && puedeEditar}
          />
        </div>
      </div>
    </div>
  )
}
