// Tipos de la ingesta (importar.mjs). El cliente Supabase se recibe ya
// construido (con sesión en el API, service role en el script), por eso va
// tipado laxo: aquí no se decide quién eres, sólo qué se escribe.
import type { Aviso } from './validacion.mjs'

export interface ResultadoMaquilaImport {
  tipo: 'maquila'
  clave: string
  fechaCorte: string
  resultados: number
  boletas: number
  boletasEnlazadas: number
  lotes: number
  avisos: Aviso[]
}

export interface ResultadoInventarioImport {
  tipo: 'inventario'
  fecha: string
  lineas: number
  avisos: Aviso[]
}

export interface ResultadoSalidasImport {
  tipo: 'salidas'
  salidas: number
  exportaciones: number
  nacionales: number
  enlazadasMaquila: number
  enlazadasLote: number
  avisos: Aviso[]
}

export type ResultadoImport =
  | ResultadoMaquilaImport
  | ResultadoInventarioImport
  | ResultadoSalidasImport

export const KG_POR_QUINTAL_ORO: number

export function esInventario(nombreArchivo: string, bytes: Uint8Array): boolean
export function tieneSalidas(bytes: Uint8Array): boolean

export function importarSalidas(
  supabase: any,
  orgId: string,
  bytes: Uint8Array,
  nombreArchivo: string,
): Promise<ResultadoSalidasImport>

export function importarArchivo(
  supabase: any,
  orgId: string,
  bytes: Uint8Array,
  nombreArchivo: string,
  hash: string,
): Promise<ResultadoImport>

export function importarMaquila(
  supabase: any,
  orgId: string,
  bytes: Uint8Array,
  nombreArchivo: string,
  hash: string,
): Promise<ResultadoMaquilaImport>

export function importarInventario(
  supabase: any,
  orgId: string,
  bytes: Uint8Array,
  nombreArchivo: string,
  hash: string,
): Promise<ResultadoInventarioImport>
