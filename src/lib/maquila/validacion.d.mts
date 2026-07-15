// Tipos del validador de cuadres (validacion.mjs).
import type { CorteMaquila, CorteInventario, HojaSalidas } from './formato.mjs'

export interface Aviso {
  nivel: 'error' | 'aviso'
  codigo: string
  mensaje: string
}

export const KG_POR_SACO_LOTE: number

export function validarMaquila(m: CorteMaquila): Aviso[]
export function validarInventario(inv: CorteInventario): Aviso[]
export function validarSalidas(res: HojaSalidas): Aviso[]
export function tieneErrores(avisos: Aviso[]): boolean
