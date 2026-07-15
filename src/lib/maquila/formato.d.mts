// Tipos del parser puro de formatos de maquila (formato.mjs).
// Igual que ventas/cfdi.d.mts: un import de .mjs busca .d.mts, no .d.ts.

export type GrupoCalidad = 'primeras' | 'segundas' | 'terceras' | 'merma'
export type TipoProceso = 'maquila' | 'repaso_oro' | 'repaso_clasificadora'

export interface ResultadoMaquila {
  clave: string
  grupo: GrupoCalidad
  /** Cómo viene escrito en el formato (con sus erratas). */
  etiqueta: string
  sacos: number
  kilosSueltos: number
  kgPorSaco: number
  /** Recalculado: sacos × kgPorSaco + kilosSueltos. */
  totalKg: number
  /** Lo que el Excel traía en esa columna; sólo para el validador. */
  totalKgExcel: number | null
  quintales: number | null
}

export interface BoletaMaquila {
  folio: number
  proveedorNombre: string
  tipoCafe: string | null
  sacos: number
  kgBrutos: number
  taraKg: number
  kgNetos: number
  quintales: number | null
}

export interface LoteMaquila {
  numeroLote: number
  sacos: number
  kg: number
  descripcion: string
}

export interface CorteMaquila {
  nombreArchivo: string
  nombreHoja: string
  clave: string
  numero: number | null
  tipoProceso: TipoProceso
  fechaCorte: string | null
  especie: string
  tipoEntrada: string
  descripcion: string | null

  sacosEntrada: number
  kgEntrada: number
  qqEntradaExcel: number | null
  rendimientoExcel: number | null
  estimadoSacos: number | null

  kgSalida: number
  rendimiento: number | null

  resultados: ResultadoMaquila[]
  boletas: BoletaMaquila[]
  lotes: LoteMaquila[]
  observaciones: string | null

  sacosEnviadosLotes: number
  sacosMaquilasPrevias: number
  sacosTorrefaccion: number
  sacosNoEnviados: number
  sacosVenta: number
  sacosOtroLote: number
  sacosRepaso: number
  sacosCuadreTotal: number

  elaboro: string | null
  entrego: string | null
  retrillero: string | null
  calador: string | null
}

export interface LineaInventario {
  especie: string
  productoTexto: string
  clave: string | null
  entradasSacos: number
  entradasKg: number
  salidasSacos: number
  salidasKg: number
  stockKg: number
  stockSacos: number
  quintales: number | null
}

export interface SalidaMaquila {
  tipoSalida: 'exportacion' | 'nacional'
  fechaSalida: string
  /** Texto crudo: un lote puede salir de dos cortes ('MAQ-017-018'). */
  maquilaTexto: string | null
  maquilaNumero: number | null
  productoTexto: string | null
  clasificacion: string | null
  /** Sólo exportación ('26/CAS-01'). */
  guia: string | null
  /** Sólo nacional; se repite entre filas. */
  folio: number | null
  numeroLote: number | null
  destino: string | null
  /** Fraccionario en las nacionales (0.72 de saco es un saldo real). */
  sacos: number
  quintales: number | null
  loteOic: string | null
  /** Sólo exportación (la paquetera). */
  transporte: string | null
  /** Sólo nacional (VENTAS/OFICINA, VENTAS/BENEFICIO, TORREFACCION). */
  canal: string | null
  placas: string | null
  observacion: string | null
}

export interface HojaSalidas {
  nombreArchivo: string
  salidas: SalidaMaquila[]
  /** La fila de TOTAL del Excel; sirve de checksum. */
  total: { sacos: number; quintales: number } | null
}

export interface CorteInventario {
  nombreArchivo: string
  fecha: string | null
  lineas: LineaInventario[]
}

export const KG_POR_SACO: number
export const PRODUCTOS: ReadonlyArray<{ clave: string; grupo: GrupoCalidad; alias: string[] }>

export function norm(v: unknown): string
export function fecha(v: unknown): string | null
export function productoDe(texto: string): { clave: string; grupo: GrupoCalidad } | null
export function especieTipo(texto: string): { especie: string; tipo: string | null }
export function parsearMaquila(datos: ArrayBuffer | Uint8Array, nombreArchivo?: string): CorteMaquila
export function parsearInventario(datos: ArrayBuffer | Uint8Array, nombreArchivo?: string): CorteInventario
export function parsearSalidas(datos: ArrayBuffer | Uint8Array, nombreArchivo?: string): HojaSalidas
