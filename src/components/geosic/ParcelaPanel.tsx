'use client'

// Right-hand detail panel for a selected parcela. Shows declared vs measured
// area, the difference, the estado, and (for coordinators/admins) the
// approve / reject actions that hit the validation API route.
import { useState } from 'react'
import type { ParcelaGeoRow } from '@/lib/types'
import EstadoBadge from './EstadoBadge'

interface Props {
  parcela: ParcelaGeoRow
  puedeValidar: boolean
  onClose: () => void
  onChanged: () => void
}

export default function ParcelaPanel({
  parcela,
  puedeValidar,
  onClose,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tienePoligono = parcela.poligono_id !== null

  async function validar(accion: 'aprobar' | 'rechazar') {
    if (!parcela.poligono_id) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/geosic/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poligono_id: parcela.poligono_id, accion }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-start justify-between border-b border-slate-100 p-4">
        <div>
          <h2 className="text-base font-semibold text-slate-800">
            {parcela.nombre || parcela.codigo_parcela}
          </h2>
          <p className="text-xs text-slate-500">{parcela.codigo_parcela}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Field label="Productor" value={parcela.productor_nombre} />
        <Field label="Código productor" value={parcela.productor_codigo} />
        <Field
          label="Comunidad"
          value={parcela.comunidad || parcela.productor_comunidad || '—'}
        />
        <Field
          label="Municipio"
          value={parcela.municipio || parcela.productor_municipio || '—'}
        />
        <Field label="Cultivo" value={parcela.tipo_cultivo} />

        <div className="my-3 h-px bg-slate-100" />

        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Estado
          </span>
          <EstadoBadge estado={parcela.estado_validacion} />
        </div>

        <Field
          label="Superficie declarada"
          value={fmtHa(parcela.superficie_declarada_ha)}
        />
        {tienePoligono ? (
          <>
            <Field label="Área medida" value={fmtHa(parcela.area_calc_ha)} />
            <Field
              label="Diferencia"
              value={
                parcela.diferencia_ha !== null
                  ? `${fmtHa(parcela.diferencia_ha)} (${(
                      (parcela.diferencia_pct ?? 0) * 100
                    ).toFixed(1)}%)`
                  : '—'
              }
              highlight={
                (parcela.diferencia_pct ?? 0) > 0.15 ? 'danger' : undefined
              }
            />
            <Field
              label="Perímetro"
              value={
                parcela.perimetro_m !== null
                  ? `${parcela.perimetro_m.toFixed(0)} m`
                  : '—'
              }
            />
            <Field label="Levantamiento" value={parcela.fecha_levantamiento ?? '—'} />
          </>
        ) : (
          <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-500">
            Esta parcela aún no tiene polígono. Sube un KML/KMZ para
            georreferenciarla.
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-600">
            {error}
          </p>
        )}
      </div>

      {puedeValidar && tienePoligono && parcela.estado_validacion !== 'validado' && (
        <div className="flex gap-2 border-t border-slate-100 p-3">
          <button
            disabled={busy}
            onClick={() => validar('aprobar')}
            className="flex-1 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
          >
            {busy ? '…' : 'Aprobar'}
          </button>
          <button
            disabled={busy}
            onClick={() => validar('rechazar')}
            className="flex-1 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            Rechazar
          </button>
        </div>
      )}

      {puedeValidar && parcela.estado_validacion === 'validado' && (
        <div className="border-t border-slate-100 p-3">
          <button
            disabled={busy}
            onClick={() => validar('rechazar')}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Revertir validación
          </button>
        </div>
      )}
    </aside>
  )
}

function Field({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: 'danger'
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span
        className={`text-sm font-medium ${
          highlight === 'danger' ? 'text-red-600' : 'text-slate-800'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function fmtHa(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return `${v.toFixed(2)} ha`
}
