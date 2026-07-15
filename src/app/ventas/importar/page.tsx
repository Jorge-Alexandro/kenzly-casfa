// Módulo Ventas — Importar facturas CFDI 4.0 (Server Component shell;
// el parseo ocurre en el navegador dentro de ImportarCfdi).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import ImportarCfdi from '@/components/ventas/ImportarCfdi'

export const dynamic = 'force-dynamic'

export default async function ImportarCfdiPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link
          href="/ventas"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          ← Ventas
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Importar facturas CFDI</h1>
            <p className="text-sm text-slate-500">
              XML del SAT (CFDI 4.0). Cada concepto se clasifica en su línea de negocio; los
              clientes y productos nuevos se dan de alta solos.
            </p>
          </div>
          <ImportarCfdi />
        </div>
      </div>
    </div>
  )
}
