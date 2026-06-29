// Small colored badge for an estado_validacion value.
import type { EstadoValidacion } from '@/lib/types'
import { ESTADO_COLOR, ESTADO_LABEL } from '@/lib/types'

export default function EstadoBadge({
  estado,
}: {
  estado: EstadoValidacion
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: ESTADO_COLOR[estado] }}
    >
      {ESTADO_LABEL[estado]}
    </span>
  )
}
