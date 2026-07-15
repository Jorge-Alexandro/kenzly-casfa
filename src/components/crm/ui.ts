// Clases compartidas de los formularios CRM (mismo look que Ventas/captura).
export const LABEL = 'block text-xs font-medium uppercase tracking-wide text-slate-500'
export const INPUT =
  'mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none'
export const SELECT =
  'mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none'
export const BTN_PRIMARIO =
  'rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-50'
export const BTN_SECUNDARIO =
  'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100'

export function claseMensaje(tipo: 'ok' | 'error'): string {
  return tipo === 'ok'
    ? 'mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
    : 'mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800'
}

// Formato corto de fechas ISO (YYYY-MM-DD o timestamptz) para listas.
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.slice(0, 10)
}
