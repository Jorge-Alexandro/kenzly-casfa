// SIC — Certificación: tipos y constantes PURAS (client-safe).
// El acceso a datos vive en src/lib/data/certificacion.ts (server only).

export type NivelCertificacion = 'nuevo' | 't1' | 't2' | 't3' | 'organico'

export const NIVEL_ORDEN: NivelCertificacion[] = ['nuevo', 't1', 't2', 't3', 'organico']

export const NIVEL_LABEL: Record<NivelCertificacion, string> = {
  nuevo: 'Nuevo',
  t1: 'T1',
  t2: 'T2',
  t3: 'T3',
  organico: 'Orgánico',
}

export const NIVEL_BADGE: Record<NivelCertificacion, string> = {
  nuevo: 'bg-slate-100 text-slate-600',
  t1: 'bg-amber-100 text-amber-700',
  t2: 'bg-yellow-100 text-yellow-800',
  t3: 'bg-lime-100 text-lime-800',
  organico: 'bg-emerald-100 text-emerald-700',
}

export type TipoBaja = 'voluntaria' | 'defuncion' | 'sancion' | 'otro'

export const TIPO_BAJA_LABEL: Record<TipoBaja, string> = {
  voluntaria: 'Baja voluntaria',
  defuncion: 'Baja por defunción',
  sancion: 'Baja por sanción',
  otro: 'Baja (otro)',
}

/** Nivel que sigue en la progresión anual (orgánico ya es el tope). */
export function siguienteNivel(n: NivelCertificacion): NivelCertificacion {
  const i = NIVEL_ORDEN.indexOf(n)
  return i < 0 || i >= NIVEL_ORDEN.length - 1 ? 'organico' : NIVEL_ORDEN[i + 1]
}

export interface EstatusAnio {
  nivel: NivelCertificacion
  origen: string
}

export interface BajaInfo {
  tipo: TipoBaja
  fecha: string
  motivo: string | null
}

export interface ProductorCert {
  id: string
  codigo: string
  nombre_completo: string
  comunidad: string | null
  municipio: string | null
  /** nivel por año, p.ej. { 2024:{nivel:'t2',...}, 2025:{nivel:'t3',...} } */
  estatus: Record<number, EstatusAnio>
  baja: BajaInfo | null
}
