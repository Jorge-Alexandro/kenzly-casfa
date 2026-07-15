// Declaraciones TS para calculos.mjs (patrón cfdi.d.mts).
import type { EtapaOportunidad } from './tipos'

export declare const ETAPAS_ABIERTAS: EtapaOportunidad[]

export declare function esAbierta(etapa: EtapaOportunidad): boolean

export declare function valorPonderado(monto: number | string, probabilidad: number | string): number

export interface ResumenEtapa {
  n: number
  monto: number
  ponderado: number
}

export interface ResumenPipeline {
  abiertas: number
  totalAbierto: number
  ponderado: number
  porEtapa: Partial<Record<EtapaOportunidad, ResumenEtapa>>
}

export declare function resumenPipeline(
  oportunidades: { etapa: EtapaOportunidad; monto_estimado: number; probabilidad: number }[],
): ResumenPipeline

export declare function actividadVencida(
  actividad: { completada_at: string | null; fecha_programada: string | null },
  ahora?: Date,
): boolean

export declare function actividadProxima(
  actividad: { completada_at: string | null; fecha_programada: string | null },
  ahora?: Date,
  dias?: number,
): boolean

export declare function cierreVencido(
  oportunidad: { etapa: EtapaOportunidad; fecha_cierre_estimada: string | null },
  hoy?: Date,
): boolean

export declare function cierreProximo(
  oportunidad: { etapa: EtapaOportunidad; fecha_cierre_estimada: string | null },
  hoy?: Date,
  dias?: number,
): boolean

export declare function sinSeguimiento(
  oportunidad: { etapa: EtapaOportunidad; updated_at: string },
  ultimaActividad: string | null,
  ahora?: Date,
  dias?: number,
): boolean
