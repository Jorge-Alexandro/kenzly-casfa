// Módulo 4 — Acopio: tipos y constantes PURAS (sin acceso a datos).
// Client-safe: no importa el cliente Supabase de servidor, así que lo pueden
// usar tanto Server como Client Components. El acceso a datos vive en
// lib/data/acopio.ts (server only).

export type EstadoEntrada =
  | 'borrador'
  | 'en_pesaje'
  | 'pendiente_calidad'
  | 'lista_para_firma'
  | 'completada'
  | 'pdf_generado'
  | 'cancelada'

export const ESTADO_ENTRADA_LABEL: Record<EstadoEntrada, string> = {
  borrador: 'Borrador',
  en_pesaje: 'En pesaje',
  pendiente_calidad: 'Pendiente de calidad',
  lista_para_firma: 'Lista para firma',
  completada: 'Completada',
  pdf_generado: 'PDF generado',
  cancelada: 'Cancelada',
}

export const ESTADO_ENTRADA_BADGE: Record<EstadoEntrada, string> = {
  borrador: 'bg-slate-100 text-slate-600',
  en_pesaje: 'bg-amber-100 text-amber-700',
  pendiente_calidad: 'bg-sky-100 text-sky-700',
  lista_para_firma: 'bg-violet-100 text-violet-700',
  completada: 'bg-emerald-100 text-emerald-700',
  pdf_generado: 'bg-emerald-100 text-emerald-700',
  cancelada: 'bg-rose-100 text-rose-700',
}

export interface EntradaRow {
  id: string
  folio: number
  fecha_acopio: string
  proveedor_nombre: string
  comunidad: string | null
  municipio: string | null
  especie: string
  tipo: string
  total_sacos: number
  kg_netos: number
  quintales: number | null
  rendimiento: number | null
  estado: EstadoEntrada
}

export interface PesadaRow {
  id: string
  numero_pesada: number
  m1_sacos: number
  m1_kgs: number
  m2_sacos: number
  m2_kgs: number
  plastico: number
  yute: number
  henequen: number
  sacos_total: number
  kg_brutos: number
  tara_kg: number
  kg_netos: number
  quintales: number | null
}

export interface EntradaDetalle extends EntradaRow {
  productor_id: string | null
  kg_brutos: number
  tara_kg: number
  plastico: number
  yute: number
  henequen: number

  // Calidad — RESULTADO, en fracción (0.8013). Lo calcula el servidor a partir
  // de los gramos con lib/acopio/calidad.mjs.
  zaranda_16: number | null
  zaranda_15: number | null
  caracol: number | null
  mancha: number | null
  cerezo: number | null
  humedad: number | null

  // Calidad — ENTRADA, los gramos que se pesaron en la báscula (Doc R.3).
  // Las 311 entradas importadas de AppSheet traen sólo las fracciones; la
  // pantalla reconstruye sus gramos con gramosDesdeFracciones().
  muestra_g: number | null
  analisis_g: number | null
  oro_g: number | null
  cerezo_g: number | null
  zaranda_16_g: number | null
  zaranda_15_g: number | null
  caracol_g: number | null
  mancha_g: number | null

  cosecha: string | null
  comentarios: string | null
  // Evidencias y firmas (rutas en Storage) — para el recibo/evidencias.
  firma_proveedor_url: string | null
  firma_receptor_url: string | null
  foto_calidad_url: string | null
  foto_muestra_url: string | null
  foto_libreta_url: string | null
  foto_libreta2_url: string | null
  pesadas: PesadaRow[]
}

/**
 * Combo especie→tipo válido: factor de quintal, bases de la muestra y normas de
 * recepción (Doc R.3 §3). Todo es DATO, no código: cada organización define las
 * suyas y la app sólo avisa cuando la muestra queda fuera de norma.
 */
export interface ProductoCatalogo {
  especie: string
  tipo: string
  factor_quintal: number | null
  muestra_g: number | null // muestra homogeneizada (300 g)
  analisis_g: number | null // base del análisis sobre café oro (100 g)
  rend_min: number | null
  mancha_max: number | null
  cerezo_max: number | null
  humedad_min: number | null
  humedad_max: number | null
  zaranda16_min: number | null
}

export const PRODUCTO_COLS =
  'especie, tipo, factor_quintal, muestra_g, analisis_g, rend_min, mancha_max,' +
  ' cerezo_max, humedad_min, humedad_max, zaranda16_min'

export interface ProductorLite {
  id: string
  codigo: string
  nombre_completo: string
  comunidad: string | null
  municipio: string | null
}
