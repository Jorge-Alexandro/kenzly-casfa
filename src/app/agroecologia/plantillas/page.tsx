// Agroecología — Plantillas: el texto fijo de cada tipo de taller (una vez).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getPlantillas } from '@/lib/data/agro-talleres'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import PlantillaEditor from '@/components/agroecologia/PlantillaEditor'

export const dynamic = 'force-dynamic'

export default async function PlantillasPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const plantillas = await getPlantillas()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link href="/agroecologia/talleres" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          ← Talleres
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Plantillas de reporte</h1>
            <p className="text-sm text-slate-500">
              El texto fijo de cada tipo de taller: se escribe una sola vez y se usa en todos los
              eventos de ese tipo. Usa <code className="rounded bg-slate-100 px-1 text-xs">{'{comunidad}'}</code>,{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">{'{fecha_larga}'}</code>,{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">{'{tecnico}'}</code>,{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">{'{municipio}'}</code>,{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">{'{hora_inicio}'}</code> y{' '}
              <code className="rounded bg-slate-100 px-1 text-xs">{'{hora_fin}'}</code> donde el texto
              deba variar según el evento — el reporte los reemplaza solo al generar el PDF.
            </p>
          </div>

          {plantillas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              Todavía no hay plantillas cargadas.
            </div>
          ) : (
            <div className="space-y-3">
              {plantillas.map((p) => (
                <PlantillaEditor key={p.id} plantilla={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
