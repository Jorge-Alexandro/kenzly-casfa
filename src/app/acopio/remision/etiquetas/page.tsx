// Generación e impresión de etiquetas de saco.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import Etiquetas from '@/components/remision/Etiquetas'

export const dynamic = 'force-dynamic'

export default async function EtiquetasPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50 print:bg-white">
      <div className="print:hidden">
        <AppHeader orgNombre={result.session.orgNombre}>
          <Link
            href="/acopio/remision"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            ← Remisiones
          </Link>
        </AppHeader>
      </div>

      <div className="flex-1 p-4 sm:p-6 print:p-0">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="print:hidden">
            <h1 className="text-lg font-semibold text-slate-800">Etiquetas de saco</h1>
            <p className="text-sm text-slate-500">
              Imprime en cartulina, corta y perfora. La etiqueta se amarra al cuello del saco con
              rafia — el adhesivo no agarra en yute ni henequén.
            </p>
          </div>
          <Etiquetas />
        </div>
      </div>
    </div>
  )
}
