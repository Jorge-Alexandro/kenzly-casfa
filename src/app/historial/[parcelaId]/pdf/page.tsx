// Historial PDF/print view (Server Component).
import { redirect, notFound } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getHistorialParcela } from '@/lib/data/historial'
import HistorialReport from '@/components/historial/HistorialReport'
import { codigoCorto } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function HistorialPdfPage({
  params,
}: {
  params: { parcelaId: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') redirect('/login')

  const h = await getHistorialParcela(params.parcelaId)
  if (!h) notFound()

  const cod = codigoCorto(h.parcela_codigo, h.parcela_nombre)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <HistorialReport
        parcelaLabel={`${h.parcela_nombre || cod} · ${cod}`}
        productor={h.productor_nombre}
        comunidad={h.comunidad}
        esCafe={h.tipo_cultivo !== 'tropical'}
        anios={h.anios}
      />
    </div>
  )
}
