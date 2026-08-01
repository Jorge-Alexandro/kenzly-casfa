// Agroecología — Detalle de un taller: notas, evidencias, asistencia y PDF.
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getTallerDetalle } from '@/lib/data/agro-talleres'
import { getListasAsistencia } from '@/lib/data/asistencia'
import { fechaLargaEs } from '@/lib/agroecologia/taller-tipos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import TallerDetalleCliente from '@/components/agroecologia/TallerDetalleCliente'

export const dynamic = 'force-dynamic'

export default async function TallerDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const { id } = await params
  const [detalle, listas] = await Promise.all([getTallerDetalle(id), getListasAsistencia()])
  if (!detalle) return notFound()

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link href="/agroecologia/talleres" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          ← Talleres
        </Link>
        <a
          href={`/api/agroecologia/talleres/${id}/pdf`}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-800"
        >
          ↓ Descargar reporte (PDF)
        </a>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              {detalle.plantilla?.nombre_taller || detalle.tipo_nombre}
            </h1>
            <p className="text-sm text-slate-500">
              {detalle.programa_nombre} · {detalle.taller.comunidad}
              {detalle.taller.municipio && `, ${detalle.taller.municipio}`} · {fechaLargaEs(detalle.taller.fecha)}
              {detalle.taller.historico && (
                <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">histórico</span>
              )}
            </p>
          </div>

          {!detalle.plantilla && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Este tipo de taller todavía no tiene plantilla — el PDF saldrá sólo con los datos del
              evento. Ve a <Link href="/agroecologia/plantillas" className="underline">Plantillas</Link> para
              escribirla.
            </p>
          )}

          <TallerDetalleCliente detalle={detalle} listas={listas} />
        </div>
      </div>
    </div>
  )
}
