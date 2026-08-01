// Agroecología — Captura de un taller (el evento). 8 campos, no 10 páginas.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getProgramas } from '@/lib/data/agroecologia'
import { getComunidadesPrograma, getTiposTallerPrograma } from '@/lib/data/agro-talleres'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import NuevoTallerForm from '@/components/agroecologia/NuevoTallerForm'

export const dynamic = 'force-dynamic'

export default async function NuevoTallerPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const programas = await getProgramas()
  // Pocos programas/tipos/comunidades en total: se traen todos de una vez y el
  // formulario filtra en el cliente al elegir programa — evita una ruta API
  // extra sólo para esto.
  const porPrograma = await Promise.all(
    programas.map(async (p) => ({
      programaId: p.id,
      tipos: await getTiposTallerPrograma(p.id),
      comunidades: await getComunidadesPrograma(p.id),
    })),
  )

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link href="/agroecologia/talleres" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          ← Talleres
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Nuevo taller</h1>
            <p className="text-sm text-slate-500">
              El contenido (introducción, objetivos, desarrollo…) ya está en la plantilla del tipo de
              taller. Aquí sólo se captura el evento.
            </p>
          </div>

          {programas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No hay programas cargados todavía.
            </p>
          ) : (
            <NuevoTallerForm programas={programas} porPrograma={porPrograma} />
          )}
        </div>
      </div>
    </div>
  )
}
