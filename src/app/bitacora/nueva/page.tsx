// Nueva bitácora (Server Component).
//  - sin params: bitácora suelta, eliges parcela + año.
//  - ?ficha=ID: bitácora anexo de esa ficha (parcela y año preseleccionados).
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getParcelasLite, getFichaDetalle } from '@/lib/data/fichas'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import BitacoraEditor from '@/components/bitacora/BitacoraEditor'
import { codigoCorto } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function NuevaBitacoraPage({
  searchParams,
}: {
  searchParams: { ficha?: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const anioActual = new Date().getFullYear()

  // --- Bitácora anexo de una ficha ---
  if (searchParams.ficha) {
    const ficha = await getFichaDetalle(searchParams.ficha)
    if (!ficha) redirect('/fichas')
    // Si la ficha ya tiene bitácora, ve a editarla.
    if (ficha.bitacora) redirect(`/bitacora/${ficha.bitacora.id}`)

    const parcela = ficha.parcelas[0]
    if (!parcela) redirect(`/fichas/${searchParams.ficha}`)

    const anio = ficha.ficha.fecha_inspeccion
      ? new Date(ficha.ficha.fecha_inspeccion).getFullYear()
      : anioActual
    const cod = codigoCorto(parcela.codigo_parcela, parcela.nombre)

    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
        <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
        <div className="min-h-0 flex-1 overflow-auto">
          <BitacoraEditor
            mode="editar"
            parcelaFija={{
              id: parcela.id,
              label: `${parcela.nombre || cod} · ${cod} (anexo de ficha)`,
            }}
            anioInicial={anio}
            fichaId={searchParams.ficha}
          />
        </div>
      </div>
    )
  }

  // --- Bitácora suelta ---
  const parcelas = await getParcelasLite()
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
      <div className="min-h-0 flex-1 overflow-auto">
        <BitacoraEditor mode="nueva" parcelas={parcelas} anioInicial={anioActual} />
      </div>
    </div>
  )
}
