// Flujo de estados de una ficha de inspección + permisos por rol.
// borrador → en_revision → aprobada → pdf_generado ; requiere_correccion (regreso).
import type { EstadoFicha, RolMembresia } from '@/lib/types'

export interface AccionEstado {
  to: EstadoFicha
  label: string
  tono: 'primary' | 'positive' | 'danger' | 'neutral'
}

const esCoordinador = (rol: RolMembresia) => rol === 'admin' || rol === 'coordinador'
const esInspector = (rol: RolMembresia) =>
  rol === 'inspector' || esCoordinador(rol)

// Transiciones permitidas desde un estado para un rol dado.
export function accionesPermitidas(
  estado: EstadoFicha,
  rol: RolMembresia,
): AccionEstado[] {
  switch (estado) {
    case 'borrador':
      return esInspector(rol)
        ? [{ to: 'en_revision', label: 'Enviar a revisión', tono: 'primary' }]
        : []
    case 'requiere_correccion':
      return esInspector(rol)
        ? [{ to: 'en_revision', label: 'Reenviar a revisión', tono: 'primary' }]
        : []
    case 'en_revision':
      return esCoordinador(rol)
        ? [
            { to: 'aprobada', label: 'Aprobar', tono: 'positive' },
            { to: 'requiere_correccion', label: 'Devolver a corrección', tono: 'danger' },
          ]
        : []
    case 'aprobada':
      return esCoordinador(rol)
        ? [
            { to: 'pdf_generado', label: 'Marcar PDF generado', tono: 'primary' },
            { to: 'en_revision', label: 'Reabrir', tono: 'neutral' },
          ]
        : []
    case 'pdf_generado':
      return rol === 'admin'
        ? [{ to: 'aprobada', label: 'Reabrir', tono: 'neutral' }]
        : []
    default:
      return []
  }
}

// Color del badge por estado (para la barra de flujo).
export const ESTADO_FICHA_BADGE: Record<EstadoFicha, string> = {
  borrador: 'bg-slate-100 text-slate-600',
  en_revision: 'bg-amber-100 text-amber-700',
  aprobada: 'bg-green-100 text-green-700',
  pdf_generado: 'bg-sky-100 text-sky-700',
  requiere_correccion: 'bg-red-100 text-red-700',
}
