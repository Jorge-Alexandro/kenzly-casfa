// Bitácora PDF/print view (Server Component).
import { redirect, notFound } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getBitacora } from '@/lib/data/bitacora'
import BitacoraReport from '@/components/bitacora/BitacoraReport'

export const dynamic = 'force-dynamic'

export default async function BitacoraPdfPage({
  params,
}: {
  params: { id: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') redirect('/login')

  const b = await getBitacora(params.id)
  if (!b) notFound()

  const label = `${b.parcela_nombre || b.parcela_codigo} · ${b.parcela_codigo}`

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <BitacoraReport
        anio={b.anio}
        datos={b.datos}
        parcelaLabel={label}
        productor={b.productor_nombre}
        comunidad={b.comunidad}
        esCafe={b.tipo_cultivo !== 'tropical'}
      />
    </div>
  )
}
