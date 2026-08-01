// Ventas — Tabulador: la conversión piezas↔kilos por producto, auditable y
// editable en un solo lugar. El reporte viejo de Excel calculaba los kilos
// procesados con =Cantidad/2 en TODAS las filas (sólo acertaba en la
// presentación de 500 g); aquí kg_por_unidad vive por producto y alimenta
// todo el reporteo real.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getProductos } from '@/lib/data/ventas'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import TabuladorCliente from '@/components/ventas/TabuladorCliente'

export const dynamic = 'force-dynamic'

export default async function TabuladorPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const productos = await getProductos()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link href="/ventas" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          ← Ventas
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Tabulador de conversión</h1>
            <p className="text-sm text-slate-500">
              Cuántos kilos representa UNA pieza de cada producto — de aquí salen los kilos de todo
              el reporte de ventas. También es el catálogo exacto de conceptos que se debe copiar al
              facturar: si doña Juani factura con este texto tal cual, no hay líneas duplicadas por
              variar la descripción.
            </p>
          </div>

          <TabuladorCliente productos={productos} />
        </div>
      </div>
    </div>
  )
}
