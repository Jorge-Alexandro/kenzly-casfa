// Autorización comercial CENTRALIZADA (client-safe): una sola regla para UI,
// API y quien venga después. La BD la refuerza con es_editor_comercial (RLS).
import type { RolMembresia } from '@/lib/types'

// admin, coordinador y ventas crean/modifican; el resto solo consulta.
export function puedeEditarCRM(rol: RolMembresia): boolean {
  return rol === 'admin' || rol === 'coordinador' || rol === 'ventas'
}
