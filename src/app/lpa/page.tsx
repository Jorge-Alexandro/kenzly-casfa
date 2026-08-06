// Generador del LPA — resumen de lo que se incluye + descarga del Excel.
// CASFA manda a MAYACERT 3 LPA separados (no un solo archivo mezclado):
// Café Robusta, Café General y Cultivos Tropicales — cada productor cae en
// exactamente uno según su código y el tipo de cultivo de sus parcelas.
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { buildLpaTodos, GRUPOS_LPA, type GrupoLpa } from '@/lib/data/lpa'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'

export const dynamic = 'force-dynamic'

export default async function LpaPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const todos = await buildLpaTodos(null)
  const ciclos = todos.robusta.resumen.ciclos // mismo universo de ciclos para los 3

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Generador del LPA</h1>
            <p className="text-sm text-slate-500">
              Arma los 3 entregables anuales para MAYACERT desde la base: padrón, certificación por
              año, producción por cultivo y bajas. Un productor sólo aparece en el LPA que le
              corresponde según su código y el cultivo de sus parcelas.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {GRUPOS_LPA.map(({ id, nombre, descripcion }) => (
              <GrupoCard key={id} id={id} nombre={nombre} descripcion={descripcion} resumen={todos[id].resumen} />
            ))}
          </div>

          {ciclos.length > 1 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Otro ciclo de estimación (aplica a los 3 LPA):{' '}
              {ciclos.map((c) => (
                <span key={c} className="mr-3 whitespace-nowrap">
                  {c}:{' '}
                  {GRUPOS_LPA.map(({ id, nombre }) => (
                    <a
                      key={id}
                      href={`/api/lpa?grupo=${id}&ciclo=${encodeURIComponent(c)}`}
                      className="mr-2 text-orange-700 hover:underline"
                    >
                      {nombre}
                    </a>
                  ))}
                </span>
              ))}
            </div>
          )}

          {/* Notas de alcance */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium">Alcance de esta versión</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>Separación de LPA: código <b>CR…</b> → Café Robusta; código <b>MX…</b> con parcela de café → Café General; <b>MX…</b> con parcela tropical → Cultivos Tropicales.</li>
              <li><b>CURP/INE</b> salen del padrón y <b>Latitud/Longitud</b> del centroide del polígono activo de GeoSIC: se llenan donde ese dato existe.</li>
              <li>La <b>producción de café</b> usa la estimación de cosecha del ciclo elegido cuando existe; si no, la última producción declarada por parcela.</li>
              <li>La <b>producción tropical</b> (cacao/coco/mango/plátano/canela/marañón) refleja la última captura por parcela, no un ciclo específico.</li>
              <li>La <b>Reducción de Superficie</b> se importa del LPA; a futuro puede calcularse del histórico de superficie por parcela.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function GrupoCard({
  id, nombre, descripcion, resumen,
}: {
  id: GrupoLpa
  nombre: string
  descripcion: string
  resumen: { productores: number; parcelas: number; bajas: number; reducciones: number; ciclo: string | null }
}) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-800">{nombre}</h2>
      <p className="mt-1 text-xs text-slate-500">{descripcion}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Tile label="Productores" value={resumen.productores} />
        <Tile label="Filas (parcelas)" value={resumen.parcelas} />
        <Tile label="Bajas" value={resumen.bajas} />
        <Tile label="Reducciones" value={resumen.reducciones} />
      </div>

      <a
        href={`/api/lpa?grupo=${id}${resumen.ciclo ? `&ciclo=${encodeURIComponent(resumen.ciclo)}` : ''}`}
        className="mt-4 inline-block rounded-md bg-orange-600 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-orange-700"
      >
        ↓ Descargar {nombre}{resumen.ciclo ? ` · ${resumen.ciclo}` : ''}
      </a>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 p-2">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-800">{value}</div>
    </div>
  )
}
