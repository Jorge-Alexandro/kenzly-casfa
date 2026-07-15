// Módulo 6 — Maquila: consultas del lado servidor (Server Components).
// RLS acota por organización en cada query; nunca pasamos org_id del cliente.
import { createClient } from '@/lib/supabase/server'
import type { Aviso } from '@/lib/maquila/validacion.mjs'

export interface MaquilaRow {
  id: string
  clave: string
  numero: number | null
  tipo_proceso: 'maquila' | 'repaso_oro' | 'repaso_clasificadora'
  fecha_corte: string
  especie: string
  tipo_entrada: string
  sacos_entrada: number
  kg_entrada: number
  kg_salida: number
  qq_salida: number
  rendimiento: number | null
  avisos: Aviso[]
  origen_archivo: string | null
}

/** Fila de la vista que sustituye la hoja 'MASTER MAQUILAS' del Excel. */
export interface MasterRow {
  clave: string
  numero: number | null
  tipo_proceso: string
  fecha_corte: string
  especie: string
  tipo_entrada: string
  sacos_entrada: number
  kg_entrada: number
  qq_entrada: number | null
  sacos_primeras: number
  qq_primeras: number
  rend_primeras: number | null
  sacos_segundas: number
  qq_segundas: number
  rend_segundas: number | null
  sacos_terceras: number
  qq_terceras: number
  rend_terceras: number | null
  sacos_salida: number
  qq_salida: number
  qq_diferencia: number
  rendimiento: number | null
  rend_proceso: number | null
}

export async function getMaquilas(): Promise<MaquilaRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maquilas')
    .select(
      'id, clave, numero, tipo_proceso, fecha_corte, especie, tipo_entrada,' +
        ' sacos_entrada, kg_entrada, kg_salida, qq_salida, rendimiento, avisos, origen_archivo',
    )
    .order('fecha_corte', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as MaquilaRow[]
}

/** El MASTER, derivado. Ya no se teclea: se consulta. */
export async function getMaster(): Promise<MasterRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_maquila_master')
    .select('*')
    .order('fecha_corte', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as MasterRow[]
}

export interface SalidaRow {
  id: string
  tipo_salida: 'exportacion' | 'nacional'
  fecha_salida: string
  /** Sólo exportación ('26/CAS-01'). */
  guia: string | null
  /** Sólo nacional; se repite entre filas, no es llave. */
  folio: number | null
  numero_lote: number | null
  destino: string | null
  sacos: number
  quintales: number | null
  lote_oic: string | null
  transporte: string | null
  canal: string | null
  placas: string | null
  producto_texto: string | null
  observacion: string | null
}

export async function getSalidas(): Promise<SalidaRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maquila_salida')
    .select(
      'id, tipo_salida, fecha_salida, guia, folio, numero_lote, destino, sacos, quintales,' +
        ' lote_oic, transporte, canal, placas, producto_texto, observacion',
    )
    .order('fecha_salida', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as SalidaRow[]
}

/** Último corte de inventario con sus renglones. */
export async function getInventarioUltimo() {
  const supabase = await createClient()
  const { data: corte, error } = await supabase
    .from('inventario_corte')
    .select('id, fecha')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!corte) return null

  const { data: lineas, error: lErr } = await supabase
    .from('inventario_linea')
    .select('especie, producto_texto, stock_sacos, stock_kg, quintales')
    .eq('corte_id', corte.id)
    .gt('stock_kg', 0)
  if (lErr) throw new Error(lErr.message)

  return { fecha: corte.fecha as string, lineas: lineas ?? [] }
}
