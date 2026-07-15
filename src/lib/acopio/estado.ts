// Acopio — máquina de estados de la entrada (client-safe, pura).
// Flujo: en_pesaje → pendiente_calidad → lista_para_firma → completada.
// Reabrir o cancelar sólo lo puede un supervisor (admin/coordinador).
import { aplicaRendimiento } from './calidad.mjs'
import type { EstadoEntrada } from './tipos'
import type { RolMembresia } from '@/lib/types'

/** Roles que pueden reabrir o cancelar una entrada. */
export const SUPERVISOR: RolMembresia[] = ['admin', 'coordinador']
export const esSupervisor = (rol: RolMembresia) => SUPERVISOR.includes(rol)

/** Transiciones estructuralmente permitidas. */
export const TRANSICIONES: Record<EstadoEntrada, EstadoEntrada[]> = {
  borrador: ['en_pesaje', 'cancelada'],
  en_pesaje: ['pendiente_calidad', 'cancelada'],
  pendiente_calidad: ['lista_para_firma', 'en_pesaje', 'cancelada'],
  lista_para_firma: ['completada', 'pendiente_calidad', 'cancelada'],
  completada: ['en_pesaje'], // reabrir para corregir
  pdf_generado: ['en_pesaje'],
  cancelada: ['en_pesaje'], // reactivar
}

/** Transiciones que exigen rol de supervisor. */
export function requiereSupervisor(desde: EstadoEntrada, hacia: EstadoEntrada): boolean {
  if (hacia === 'cancelada') return true
  // Volver atrás (reabrir/corregir) desde un estado ya cerrado o firmado.
  if (desde === 'completada' || desde === 'pdf_generado' || desde === 'cancelada') return true
  if (desde === 'lista_para_firma' && hacia === 'pendiente_calidad') return true
  if (desde === 'pendiente_calidad' && hacia === 'en_pesaje') return true
  return false
}

/** Lo mínimo que necesita la entrada para poder evaluar una transición. */
export interface EntradaEstado {
  estado: EstadoEntrada
  num_pesadas: number
  // El producto decide QUÉ análisis se le exige: al cacao sólo humedad, y al
  // café que entró ya en oro no se le puede pedir rendimiento (no se acopió en
  // pergamino ni en cereza). Pedírselos lo dejaría sin poder firmarse nunca.
  especie: string
  tipo: string
  rendimiento: number | null
  humedad: number | null
  firma_receptor_url: string | null
  firma_proveedor_url: string | null
}

/** Qué le falta a la entrada para llegar a `hacia` (vacío = puede avanzar). */
export function faltantes(e: EntradaEstado, hacia: EstadoEntrada): string[] {
  const f: string[] = []
  if (hacia === 'pendiente_calidad' && e.num_pesadas === 0) {
    f.push('Registra al menos una pesada')
  }
  if (hacia === 'lista_para_firma') {
    if (e.num_pesadas === 0) f.push('Registra al menos una pesada')
    if (e.humedad == null) f.push('Captura la humedad')
    if (aplicaRendimiento(e.especie, e.tipo) && e.rendimiento == null) {
      f.push('Captura el rendimiento (gramos de café oro de la muestra)')
    }
  }
  if (hacia === 'completada') {
    if (!e.firma_receptor_url) f.push('Falta la firma del receptor')
    if (!e.firma_proveedor_url) f.push('Falta la firma del proveedor')
  }
  return f
}

export interface Evaluacion {
  ok: boolean
  motivos: string[]
}

/** ¿Se puede pasar de `e.estado` a `hacia` con este rol? */
export function puedeTransicionar(
  e: EntradaEstado,
  hacia: EstadoEntrada,
  rol: RolMembresia,
): Evaluacion {
  const motivos: string[] = []
  if (!TRANSICIONES[e.estado]?.includes(hacia)) {
    motivos.push(`No se puede pasar de ${e.estado} a ${hacia}`)
    return { ok: false, motivos }
  }
  if (requiereSupervisor(e.estado, hacia) && !esSupervisor(rol)) {
    motivos.push('Sólo un supervisor (admin/coordinador) puede hacer este cambio')
  }
  motivos.push(...faltantes(e, hacia))
  return { ok: motivos.length === 0, motivos }
}

/** Siguiente paso natural del flujo (para el botón principal). */
export function siguiente(estado: EstadoEntrada): EstadoEntrada | null {
  const flujo: Partial<Record<EstadoEntrada, EstadoEntrada>> = {
    borrador: 'en_pesaje',
    en_pesaje: 'pendiente_calidad',
    pendiente_calidad: 'lista_para_firma',
    lista_para_firma: 'completada',
  }
  return flujo[estado] ?? null
}
