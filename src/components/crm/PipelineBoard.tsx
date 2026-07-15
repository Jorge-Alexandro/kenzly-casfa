'use client'

// Tablero Kanban del pipeline. El cambio de etapa es por botón "Mover"
// (control accesible; drag-and-drop agregaría dependencia sin necesidad).
import { useState } from 'react'
import Link from 'next/link'
import CambiarEtapaModal, { type ClienteFiscalOpcion } from './CambiarEtapaModal'
import OportunidadFormModal, { type ProductoOpcion } from './OportunidadFormModal'
import { BTN_SECUNDARIO, fechaCorta } from './ui'
import { formatoMXN } from '@/lib/ventas/tipos'
import { valorPonderado, cierreVencido } from '@/lib/crm/calculos.mjs'
import {
  ETAPAS,
  ETAPA_LABEL,
  ETAPA_BADGE,
  nombreMiembro,
  type MiembroOrg,
  type OportunidadRow,
} from '@/lib/crm/tipos'

export default function PipelineBoard({
  oportunidades,
  cuentas,
  productos,
  miembros,
  clientesFiscales,
  cuentasVinculadas,
  puedeEditar,
  abrirNueva = false,
}: {
  oportunidades: OportunidadRow[]
  cuentas: { id: string; nombre: string }[]
  productos: ProductoOpcion[]
  miembros: MiembroOrg[]
  clientesFiscales: ClienteFiscalOpcion[]
  cuentasVinculadas: Record<string, boolean>
  puedeEditar: boolean
  abrirNueva?: boolean
}) {
  const [moviendo, setMoviendo] = useState<OportunidadRow | null>(null)
  const [nuevaAbierta, setNuevaAbierta] = useState(abrirNueva)

  const porNombre = new Map(miembros.map((m) => [m.id, nombreMiembro(m)]))

  return (
    <div className="space-y-3">
      {puedeEditar && (
        <div className="flex justify-end">
          <button onClick={() => setNuevaAbierta(true)} className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700">
            + Oportunidad
          </button>
        </div>
      )}

      {/* Columnas con scroll horizontal (funciona igual en tablet/celular) */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {ETAPAS.map((etapa) => {
          const lista = oportunidades.filter((o) => o.etapa === etapa)
          const monto = lista.reduce((s, o) => s + Number(o.monto_estimado), 0)
          return (
            <div key={etapa} className="flex w-64 shrink-0 flex-col rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ETAPA_BADGE[etapa]}`}>
                    {ETAPA_LABEL[etapa]}
                  </span>
                  <span className="text-xs tabular-nums text-slate-500">{lista.length}</span>
                </div>
                <p className="mt-1 text-xs tabular-nums text-slate-500">{formatoMXN(monto)}</p>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {lista.length === 0 ? (
                  <p className="px-1 py-3 text-center text-xs text-slate-300">Sin oportunidades</p>
                ) : (
                  lista.map((o) => {
                    const vencida = cierreVencido(o)
                    return (
                      <div key={o.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
                        <p className="text-sm font-medium leading-snug text-slate-800">{o.nombre}</p>
                        {o.cuenta && (
                          <Link href={`/crm/cuentas/${o.cuenta.id}`} className="mt-0.5 block truncate text-xs text-orange-700 hover:underline">
                            {o.cuenta.nombre}
                          </Link>
                        )}
                        <p className="mt-1.5 text-sm font-semibold tabular-nums text-slate-700">
                          {formatoMXN(Number(o.monto_estimado))}
                          <span className="ml-1 text-xs font-normal text-slate-400">
                            · pond. {formatoMXN(valorPonderado(o.monto_estimado, o.probabilidad))}
                          </span>
                        </p>
                        <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                          {o.responsable_id && <p className="truncate">👤 {porNombre.get(o.responsable_id) ?? '—'}</p>}
                          {o.proxima_actividad && (
                            <p className="truncate">
                              ⏰ {o.proxima_actividad.asunto}
                              {o.proxima_actividad.fecha_programada ? ` · ${fechaCorta(o.proxima_actividad.fecha_programada)}` : ''}
                            </p>
                          )}
                          {o.fecha_cierre_estimada && (
                            <p className={vencida ? 'font-medium text-rose-600' : ''}>
                              📅 cierre {fechaCorta(o.fecha_cierre_estimada)}{vencida ? ' — vencida' : ''}
                            </p>
                          )}
                          {etapa === 'perdido' && o.motivo_perdida && (
                            <p className="truncate italic">✗ {o.motivo_perdida}</p>
                          )}
                        </div>
                        {puedeEditar && (
                          <button onClick={() => setMoviendo(o)} className={`mt-2 w-full ${BTN_SECUNDARIO}`}>
                            Mover de etapa
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {moviendo && (
        <CambiarEtapaModal
          abierto
          onCerrar={() => setMoviendo(null)}
          oportunidad={moviendo}
          cuentaVinculada={Boolean(moviendo.cuenta && cuentasVinculadas[moviendo.cuenta.id])}
          clientesFiscales={clientesFiscales}
        />
      )}
      {nuevaAbierta && (
        <OportunidadFormModal
          abierto
          onCerrar={() => setNuevaAbierta(false)}
          cuentas={cuentas}
          productos={productos}
          miembros={miembros}
        />
      )}
    </div>
  )
}
