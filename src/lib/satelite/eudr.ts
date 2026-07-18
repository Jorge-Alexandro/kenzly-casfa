// Tamizado EUDR interno a partir de una serie NDVI (2020 → hoy).
// Compara el pico de cobertura de 2020 con el actual y detecta un posible
// evento de despeje (caída profunda) posterior a 2020.
//
// Es una ALERTA TEMPRANA por NDVI, no el veredicto oficial EUDR (que usa la
// capa forestal 2020 de la UE + análisis de MAYACERT).
import type { MedicionSatelital } from './sentinel'

export type ClasificacionEudr = 'sin_cambio' | 'vigilar' | 'posible_perdida' | 'sin_datos'

export interface ResultadoEudr {
  ndvi_2020: number | null
  ndvi_actual: number | null
  delta: number | null
  min_post2020: number | null
  fecha_min: string | null
  imagenes: number
  clasificacion: ClasificacionEudr
}

// Umbrales (NDVI). Bosque/dosel denso ≈ 0.7-0.9; suelo desnudo ≈ 0.1-0.3.
const NDVI_DENSO_2020 = 0.6 // en 2020 estaba densamente cubierto (posible bosque)
const NDVI_DESPEJE = 0.35 // caída a este nivel = posible remoción de cobertura
const DELTA_PERDIDA = -0.2 // el dosel actual cayó fuerte respecto a 2020
const DELTA_VIGILAR = -0.1

function pico(vals: number[]): number | null {
  if (vals.length === 0) return null
  // Percentil 90 (robusto a nubes/sombra que bajan el NDVI puntual).
  const s = [...vals].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]
}

export function clasificarEudr(serie: MedicionSatelital[]): ResultadoEudr {
  const hoy = new Date()
  const hace12m = new Date(hoy)
  hace12m.setMonth(hace12m.getMonth() - 12)

  const en2020 = serie.filter((m) => m.fecha_imagen.startsWith('2020'))
  const actual = serie.filter((m) => new Date(m.fecha_imagen) >= hace12m)
  // Ventana intermedia: 2021 hasta hace 6 meses (donde buscamos el despeje).
  const hace6m = new Date(hoy)
  hace6m.setMonth(hace6m.getMonth() - 6)
  const intermedia = serie.filter(
    (m) => m.fecha_imagen >= '2021-01-01' && new Date(m.fecha_imagen) < hace6m,
  )

  const ndvi2020 = pico(en2020.map((m) => m.ndvi_promedio))
  const ndviActual = pico(actual.map((m) => m.ndvi_promedio))

  // Mínimo intermedio (posible evento de despeje).
  let minInter: number | null = null
  let fechaMin: string | null = null
  for (const m of intermedia) {
    if (minInter === null || m.ndvi_promedio < minInter) {
      minInter = m.ndvi_promedio
      fechaMin = m.fecha_imagen
    }
  }

  const base: ResultadoEudr = {
    ndvi_2020: ndvi2020,
    ndvi_actual: ndviActual,
    delta: ndvi2020 !== null && ndviActual !== null ? Number((ndviActual - ndvi2020).toFixed(4)) : null,
    min_post2020: minInter,
    fecha_min: fechaMin,
    imagenes: serie.length,
    clasificacion: 'sin_datos',
  }

  if (ndvi2020 === null || ndviActual === null) return base

  // Evento de despeje: en 2020 estaba denso y después cayó a nivel de suelo.
  const huboDespeje = minInter !== null && minInter < NDVI_DESPEJE && ndvi2020 >= NDVI_DENSO_2020
  const delta = base.delta ?? 0

  let clas: ClasificacionEudr
  if (huboDespeje || delta <= DELTA_PERDIDA) {
    clas = 'posible_perdida'
  } else if (delta <= DELTA_VIGILAR || (minInter !== null && minInter < 0.45)) {
    clas = 'vigilar'
  } else {
    clas = 'sin_cambio'
  }

  return { ...base, clasificacion: clas }
}

export const EUDR_LABEL: Record<ClasificacionEudr, string> = {
  posible_perdida: 'Posible pérdida de cobertura',
  vigilar: 'Vigilar',
  sin_cambio: 'Sin cambio aparente',
  sin_datos: 'Sin datos',
}

export const EUDR_COLOR: Record<ClasificacionEudr, string> = {
  posible_perdida: '#dc2626',
  vigilar: '#f59e0b',
  sin_cambio: '#16a34a',
  sin_datos: '#94a3b8',
}
