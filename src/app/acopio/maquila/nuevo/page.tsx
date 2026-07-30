// Captura nativa de un corte de maquila (Fase 1): reemplaza llenar el Excel.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import { getBoletasDisponibles, getCatalogoMaquila, getSiguienteCorte } from '@/lib/data/maquila'
import NuevoCorteForm from '@/components/maquila/NuevoCorteForm'

export const dynamic = 'force-dynamic'

export default async function NuevoCortePage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const [disponibles, catalogo, siguiente] = await Promise.all([
    getBoletasDisponibles(),
    getCatalogoMaquila(),
    getSiguienteCorte(),
  ])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link
          href="/acopio/maquila"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          ← Maquila
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Nuevo corte de maquila</h1>
            <p className="text-sm text-slate-500">
              Elige las boletas que entraron al beneficio y lo que salió por producto. El kg de
              entrada, el factor de quintal y el cuadre de sacos se calculan solos.
            </p>
          </div>

          <NuevoCorteForm disponibles={disponibles} catalogo={catalogo} siguiente={siguiente} />
        </div>
      </div>
    </div>
  )
}
