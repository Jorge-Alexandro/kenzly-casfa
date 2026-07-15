'use client'

// Lista lateral: cada parcela con su NDVI y un punto de color por alerta.
import type { ParcelaSateliteRow } from '@/lib/satelite/indices'
import { ALERTA_COLOR, ALERTA_LABEL, fmtNdvi, colorNdvi } from '@/lib/satelite/indices'

interface Props {
  parcelas: ParcelaSateliteRow[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function ParcelaSatList({ parcelas, selectedId, onSelect }: Props) {
  if (parcelas.length === 0) {
    return (
      <p className="p-4 text-sm text-slate-500">
        No hay parcelas que coincidan con el filtro.
      </p>
    )
  }

  return (
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {parcelas.map((p) => {
        const alerta = p.alerta ?? 'sin_datos'
        return (
          <li key={p.id}>
            <button
              onClick={() => onSelect(p.id)}
              className={`flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2 text-left transition hover:bg-slate-50 ${
                selectedId === p.id ? 'bg-orange-50' : ''
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: ALERTA_COLOR[alerta] }}
                title={ALERTA_LABEL[alerta]}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {p.nombre || p.codigo_parcela}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {p.productor_nombre}
                </span>
              </span>
              <span
                className="shrink-0 text-sm font-semibold tabular-nums"
                style={{ color: colorNdvi(p.ndvi_promedio) }}
              >
                {fmtNdvi(p.ndvi_promedio)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
