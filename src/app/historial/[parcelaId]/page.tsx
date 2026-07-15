// Historial de una parcela (Server Component): carga años y monta el editor.
import { redirect, notFound } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getHistorialParcela } from '@/lib/data/historial'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import HistorialEditor from '@/components/historial/HistorialEditor'
import { codigoCorto } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function HistorialParcelaPage({
  params,
}: {
  params: { parcelaId: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const h = await getHistorialParcela(params.parcelaId)
  if (!h) notFound()

  const cod = codigoCorto(h.parcela_codigo, h.parcela_nombre)
  const label = `${h.parcela_nombre || cod} · ${cod} — ${h.productor_nombre}`

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
      <div className="min-h-0 flex-1 overflow-auto">
        <HistorialEditor
          parcelaId={h.parcela_id}
          parcelaLabel={label}
          aniosIniciales={h.anios}
        />
      </div>
    </div>
  )
}
