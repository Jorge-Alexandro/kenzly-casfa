// Agroecología — Programa/talleres: tipos y constantes PURAS (client-safe).
// El acceso a datos vive en src/lib/data/agroecologia.ts (server only).

export interface ProgramaLite {
  id: string
  nombre: string
  ciclo: string
}

export interface TipoTaller {
  id: string
  clave: string
  nombre: string
  orden: number
}

export interface ComunidadRow {
  id: string
  comunidad: string
  municipio: string | null
  socios: number
  hectareas: number
  plantas_entregadas: number
  abono_ton: number
}

export interface AvanceCell {
  comunidad_id: string
  tipo_taller_id: string
  impartido: boolean
  f: number
  m: number
  avance: number
}

export interface AgroKpis {
  comunidades: number
  socios: number
  talleres_impartidos: number
  asistencias: number // Σ (F+M)
  f: number
  m: number
  superficie: number
  plantas: number
  abono: number
  pct_asistencia: number // promedio de avance en celdas impartidas
}

export interface Matriz {
  programa: ProgramaLite
  tipos: TipoTaller[]
  comunidades: ComunidadRow[]
  avances: AvanceCell[]
  kpis: AgroKpis
}

/** clave del mapa de avances por celda. */
export const cellKey = (comunidadId: string, tipoId: string) => `${comunidadId}:${tipoId}`

/** % de asistencia de una celda = (F+M)/socios, acotado a [0,1]. */
export function avanceCelda(f: number, m: number, socios: number): number {
  if (!socios || socios <= 0) return 0
  return Math.min(1, Math.round(((f + m) / socios) * 10000) / 10000)
}
