// SateliteSIC — logica pura de indices de vegetacion. Sin dependencias de
// servidor: la importan tanto los Client Components (mapa, panel) como la API
// route. Igual que lib/acopio/tipos.ts, aqui NO puede entrar nada de
// next/headers ni del cliente Supabase de servidor.

export type AlertaSatelital =
  | 'normal'
  | 'estres_hidrico'
  | 'posible_enfermedad'
  | 'critico'
  | 'sin_datos'

// Umbrales de NDVI acordados con CASFA.
// OJO: son ABSOLUTOS. El cafe bajo sombra en el Soconusco vive normalmente
// entre 0.7 y 0.85, asi que un NDVI de 0.5 en una parcela establecida ya es
// senal de algo. En parcelas recien renovadas (poca cobertura) estos umbrales
// dan falsos positivos — por eso guardamos la serie completa: la regla
// relativa (caida vs. la propia historia de la parcela) se puede anadir despues
// sin volver a llamar a Sentinel.
export const UMBRAL_NDVI = {
  normal: 0.6,
  estres_hidrico: 0.4,
  posible_enfermedad: 0.2,
} as const

// Regla de negocio: NDVI -> alerta.
export function calcularAlerta(ndvi: number | null): AlertaSatelital {
  if (ndvi === null || Number.isNaN(ndvi)) return 'sin_datos'
  if (ndvi >= UMBRAL_NDVI.normal) return 'normal'
  if (ndvi >= UMBRAL_NDVI.estres_hidrico) return 'estres_hidrico'
  if (ndvi >= UMBRAL_NDVI.posible_enfermedad) return 'posible_enfermedad'
  return 'critico'
}

export const ALERTA_LABEL: Record<AlertaSatelital, string> = {
  normal: 'Normal',
  estres_hidrico: 'Estrés hídrico',
  posible_enfermedad: 'Posible enfermedad',
  critico: 'Crítico',
  sin_datos: 'Sin datos',
}

export const ALERTA_COLOR: Record<AlertaSatelital, string> = {
  normal: '#22c55e',
  estres_hidrico: '#f59e0b',
  posible_enfermedad: '#f97316',
  critico: '#ef4444',
  sin_datos: '#94a3b8',
}

export const ALERTA_DESCRIPCION: Record<AlertaSatelital, string> = {
  normal: 'Vegetación sana. Sin acción requerida.',
  estres_hidrico: 'Vigor por debajo de lo normal. Revisar riego o lluvia reciente.',
  posible_enfermedad: 'Pérdida de follaje marcada. Inspección recomendada (roya, broca).',
  critico: 'Cobertura vegetal casi nula. Inspección urgente en campo.',
  sin_datos: 'Sin imagen satelital válida (nubes o parcela sin polígono).',
}

// Escala de color continua para pintar el mapa por NDVI.
// Cafe/tropical sano cae en el extremo verde; suelo desnudo en el rojo.
export const ESCALA_NDVI: { valor: number; color: string }[] = [
  { valor: 0.0, color: '#a16207' }, // suelo desnudo
  { valor: 0.2, color: '#ef4444' },
  { valor: 0.4, color: '#f59e0b' },
  { valor: 0.6, color: '#a3e635' },
  { valor: 0.75, color: '#22c55e' },
  { valor: 0.9, color: '#15803d' }, // dosel denso
]

// Color puntual (badges, listas) interpolando la escala de arriba.
export function colorNdvi(ndvi: number | null): string {
  if (ndvi === null || Number.isNaN(ndvi)) return ALERTA_COLOR.sin_datos
  const escala = ESCALA_NDVI
  if (ndvi <= escala[0].valor) return escala[0].color
  for (let i = 1; i < escala.length; i++) {
    if (ndvi <= escala[i].valor) return escala[i].color
  }
  return escala[escala.length - 1].color
}

export function fmtNdvi(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(3)
}

// Una fila de la serie de tiempo (grafica del panel).
export interface IndiceHistorial {
  fecha_imagen: string
  ndvi_promedio: number | null
  evi_promedio: number | null
  ndwi_promedio: number | null
  cobertura_nubes: number | null
  alerta: AlertaSatelital | null
}

// Fila plana devuelta por el RPC get_parcelas_satelite().
export interface ParcelaSateliteRow {
  id: string
  codigo_parcela: string
  nombre: string | null
  tipo_cultivo: 'cafe' | 'tropical' | 'mixto'
  superficie_declarada_ha: number | null
  comunidad: string | null
  municipio: string | null
  productor_id: string
  productor_codigo: string
  productor_nombre: string
  tiene_poligono: boolean
  area_calc_ha: number | null
  centroide_lat: number | null
  centroide_lng: number | null
  // Ultimo indice (null si nunca se ha procesado)
  fecha_imagen: string | null
  ndvi_promedio: number | null
  ndvi_min: number | null
  ndvi_max: number | null
  evi_promedio: number | null
  ndwi_promedio: number | null
  cobertura_nubes: number | null
  alerta: AlertaSatelital | null
}

export interface SatStats {
  con_poligono: number
  monitoreadas: number
  ndvi_promedio: number | null
  alertas_activas: number
  criticas: number
  sin_datos: number
  ultima_actualizacion: string | null
}

export function calcularSatStats(rows: ParcelaSateliteRow[]): SatStats {
  const conPoligono = rows.filter((r) => r.tiene_poligono)
  const conNdvi = rows.filter((r) => r.ndvi_promedio !== null)

  const ndviProm =
    conNdvi.length > 0
      ? conNdvi.reduce((s, r) => s + (r.ndvi_promedio ?? 0), 0) / conNdvi.length
      : null

  // "Alerta activa" = todo lo que no es normal y sí tiene medición.
  const alertas = conNdvi.filter(
    (r) => r.alerta !== null && r.alerta !== 'normal' && r.alerta !== 'sin_datos',
  )

  const fechas = rows
    .map((r) => r.fecha_imagen)
    .filter((f): f is string => f !== null)
    .sort()

  return {
    con_poligono: conPoligono.length,
    monitoreadas: conNdvi.length,
    ndvi_promedio: ndviProm,
    alertas_activas: alertas.length,
    criticas: conNdvi.filter((r) => r.alerta === 'critico').length,
    sin_datos: conPoligono.length - conNdvi.length,
    ultima_actualizacion: fechas.length > 0 ? fechas[fechas.length - 1] : null,
  }
}
