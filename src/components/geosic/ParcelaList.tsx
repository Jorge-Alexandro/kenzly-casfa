// Scrollable list of parcelas with a status dot. Clicking selects (and the
// map flies to it). Selected row is highlighted.
import type { ParcelaGeoRow } from '@/lib/types'
import { ESTADO_COLOR, ESTADO_LABEL } from '@/lib/types'

interface Props {
  parcelas: ParcelaGeoRow[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function ParcelaList({ parcelas, selectedId, onSelect }: Props) {
  if (parcelas.length === 0) {
    return (
      <p className="p-4 text-sm text-slate-400">Sin parcelas para mostrar.</p>
    )
  }

  return (
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {parcelas.map((p) => {
        const active = p.id === selectedId
        return (
          <li key={p.id}>
            <button
              onClick={() => onSelect(p.id)}
              className={`flex w-full items-start gap-2.5 border-b border-slate-50 px-3 py-2 text-left transition ${
                active ? 'bg-orange-50' : 'hover:bg-slate-50'
              }`}
            >
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: ESTADO_COLOR[p.estado_validacion] }}
                title={ESTADO_LABEL[p.estado_validacion]}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {p.nombre || p.codigo_parcela}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {p.productor_nombre}
                </span>
              </span>
              {p.diferencia_pct !== null && (
                <span className="mt-0.5 shrink-0 text-xs font-medium text-slate-400">
                  {(p.diferencia_pct * 100).toFixed(0)}%
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
