// Módulo 4 — Acopio: consultas del lado servidor (Server Components).
// RLS acota por organización en cada query; nunca pasamos org_id del cliente.
// Los tipos/constantes puras viven en @/lib/acopio/tipos (client-safe).
import { createClient } from '@/lib/supabase/server'
import { PRODUCTO_COLS } from '@/lib/acopio/tipos'
import type {
  EntradaRow,
  EntradaDetalle,
  PesadaRow,
  ProductoCatalogo,
  ProductorLite,
} from '@/lib/acopio/tipos'

export * from '@/lib/acopio/tipos'

const ENTRADA_COLS =
  'id, folio, fecha_acopio, proveedor_nombre, comunidad, municipio, especie, tipo,' +
  ' total_sacos, kg_netos, quintales, rendimiento, estado'

export async function getEntradas(): Promise<EntradaRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entradas')
    .select(ENTRADA_COLS)
    .order('folio', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as EntradaRow[]
}

export async function getEntrada(id: string): Promise<EntradaDetalle | null> {
  const supabase = await createClient()
  const { data: e, error } = await supabase
    .from('entradas')
    .select(
      ENTRADA_COLS +
        ', productor_id, kg_brutos, tara_kg, plastico, yute, henequen,' +
        ' zaranda_16, zaranda_15, caracol, mancha, cerezo, humedad, cosecha, comentarios,' +
        ' muestra_g, analisis_g, oro_g, cerezo_g, zaranda_16_g, zaranda_15_g,' +
        ' caracol_g, mancha_g,' +
        ' firma_proveedor_url, firma_receptor_url, foto_calidad_url, foto_muestra_url,' +
        ' foto_libreta_url, foto_libreta2_url',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!e) return null

  const { data: pesadas, error: pErr } = await supabase
    .from('pesadas')
    .select(
      'id, numero_pesada, m1_sacos, m1_kgs, m2_sacos, m2_kgs, plastico, yute,' +
        ' henequen, sacos_total, kg_brutos, tara_kg, kg_netos, quintales',
    )
    .eq('entrada_id', id)
    .order('numero_pesada', { ascending: true })
  if (pErr) throw new Error(pErr.message)

  return {
    ...(e as unknown as EntradaDetalle),
    pesadas: (pesadas ?? []) as unknown as PesadaRow[],
  }
}

export async function getProductosCatalogo(): Promise<ProductoCatalogo[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('acopio_producto')
    .select(PRODUCTO_COLS)
    .eq('activo', true)
    .order('especie', { ascending: true })
    .order('tipo', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ProductoCatalogo[]
}

/** Tara por material (plastico/yute/henequen) → { material: kg }. */
export async function getTaraConfig(): Promise<Record<string, number>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('acopio_tara')
    .select('material, kg_por_unidad')
  if (error) throw new Error(error.message)
  const out: Record<string, number> = {}
  for (const r of data ?? []) out[r.material] = Number(r.kg_por_unidad)
  return out
}

export async function getProductoresLite(): Promise<ProductorLite[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('productores')
    .select('id, codigo, nombre_completo, comunidad, municipio')
    .order('nombre_completo', { ascending: true })
    .limit(2000)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ProductorLite[]
}
