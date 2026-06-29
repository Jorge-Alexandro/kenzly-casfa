// Bitácora detalle/edición (Server Component) + enlace al PDF.
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getBitacora } from '@/lib/data/bitacora'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import BitacoraEditor from '@/components/bitacora/BitacoraEditor'
import { codigoCorto } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function BitacoraDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const b = await getBitacora(params.id)
  if (!b) notFound()

  const cod = codigoCorto(b.parcela_codigo, b.parcela_nombre)
  const label = `${b.parcela_nombre || cod} · ${cod} — ${b.productor_nombre}`

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre}>
        <Link
          href={`/bitacora/${b.id}/pdf`}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Ver / Descargar PDF
        </Link>
      </AppHeader>
      <div className="min-h-0 flex-1 overflow-auto">
        <BitacoraEditor
          mode="editar"
          parcelaFija={{ id: b.parcela_id, label }}
          anioInicial={b.anio}
          datosIniciales={b.datos}
        />
      </div>
    </div>
  )
}
