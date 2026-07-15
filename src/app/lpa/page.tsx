// Generador del LPA — resumen de lo que se incluye + descarga del Excel.
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { buildLpa } from '@/lib/data/lpa'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'

export const dynamic = 'force-dynamic'

export default async function LpaPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const { resumen } = await buildLpa(null)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Generador del LPA</h1>
            <p className="text-sm text-slate-500">
              Arma el entregable anual para MAYACERT desde la base: padrón, certificación por año,
              estimación de cosecha y bajas.
            </p>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Tile label="Productores activos" value={resumen.productores} />
            <Tile label="Filas (parcelas)" value={resumen.parcelas} />
            <Tile label="Bajas" value={resumen.bajas} />
            <Tile label="Reducciones" value={resumen.reducciones} />
            <Tile label="Años de certif." value={resumen.anios.length ? resumen.anios.join(', ') : '—'} />
          </div>

          {/* Descarga */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-800">Descargar</h2>
            <p className="mt-1 text-sm text-slate-500">
              Genera un Excel con tres hojas: <b>LPA</b> (una fila por parcela con nivel de
              certificación por año, CURP/INE, coordenadas y estimación del ciclo), <b>BAJAS</b> y{' '}
              <b>Reducción de Superficie</b>.
            </p>

            <a
              href={`/api/lpa${resumen.ciclo ? `?ciclo=${encodeURIComponent(resumen.ciclo)}` : ''}`}
              className="mt-4 inline-block rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700"
            >
              ↓ Descargar LPA (Excel){resumen.ciclo ? ` · ciclo ${resumen.ciclo}` : ''}
            </a>

            {resumen.ciclos.length > 1 && (
              <div className="mt-3 text-sm text-slate-500">
                Otro ciclo de estimación:{' '}
                {resumen.ciclos.map((c) => (
                  <a key={c} href={`/api/lpa?ciclo=${encodeURIComponent(c)}`} className="mr-3 text-orange-700 hover:underline">
                    {c}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Notas de alcance */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium">Alcance de esta versión</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li><b>CURP/INE</b> salen del padrón e <b>Latitud/Longitud</b> del centroide del polígono activo de GeoSIC: se llenan donde ese dato existe.</li>
              <li>La <b>producción por cultivo</b> usa la estimación de cosecha registrada del ciclo elegido (también la que se captura en la ficha).</li>
              <li>La <b>Reducción de Superficie</b> se importa del LPA; a futuro puede calcularse del histórico de superficie por parcela.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-800">{value}</div>
    </div>
  )
}
