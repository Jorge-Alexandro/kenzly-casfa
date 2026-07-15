// Certificados — tipos, alertas y constantes PURAS (client-safe).
// El acceso a datos vive en src/lib/data/certificados.ts (server only).

export const ESQUEMAS = ['NOP USDA', 'UE', 'LPO'] as const
export type Esquema = (typeof ESQUEMAS)[number]

export interface Certificado {
  id: string
  programa: string
  esquema: string
  fecha_vencimiento: string | null
  estado: string | null
}

export type NivelAlerta = 'vencido' | 'critico' | 'proximo' | 'vigente' | 'sin_fecha'

/** Umbrales de alerta, en días antes del vencimiento. */
export const DIAS_CRITICO = 30
export const DIAS_PROXIMO = 90

export const ALERTA_LABEL: Record<NivelAlerta, string> = {
  vencido: 'Vencido',
  critico: 'Por vencer',
  proximo: 'Próximo',
  vigente: 'Vigente',
  sin_fecha: 'Sin fecha',
}

export const ALERTA_BADGE: Record<NivelAlerta, string> = {
  vencido: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
  critico: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
  proximo: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  vigente: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  sin_fecha: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

/** Días que faltan para el vencimiento (negativo = ya venció). */
export function diasRestantes(fecha: string | null, hoy = new Date()): number | null {
  if (!fecha) return null
  const v = new Date(`${fecha}T00:00:00`)
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((v.getTime() - h.getTime()) / 86_400_000)
}

export function nivelAlerta(fecha: string | null, hoy = new Date()): NivelAlerta {
  const d = diasRestantes(fecha, hoy)
  if (d == null) return 'sin_fecha'
  if (d < 0) return 'vencido'
  if (d <= DIAS_CRITICO) return 'critico'
  if (d <= DIAS_PROXIMO) return 'proximo'
  return 'vigente'
}

/** Texto humano: "vencido hace 12 días" / "en 45 días". */
export function textoDias(fecha: string | null, hoy = new Date()): string {
  const d = diasRestantes(fecha, hoy)
  if (d == null) return '—'
  if (d < 0) return `vencido hace ${Math.abs(d)} d`
  if (d === 0) return 'vence hoy'
  return `en ${d} d`
}
