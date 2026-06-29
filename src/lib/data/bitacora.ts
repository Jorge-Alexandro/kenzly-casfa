// Server-side data access for the Bitácora module.
import { createClient } from '@/lib/supabase/server'
import { normalizarDatos, type BitacoraAnual } from '@/lib/bitacora'

export interface BitacoraListRow {
  id: string
  parcela_id: string
  anio: number
  parcela_codigo: string
  parcela_nombre: string | null
  productor_nombre: string
}

// List of all bitácoras with parcela + productor names.
export async function getBitacoras(): Promise<BitacoraListRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bitacora_anual')
    .select(
      `id, parcela_id, anio,
       parcelas ( codigo_parcela, nombre, productores ( nombre_completo ) )`,
    )
    .order('anio', { ascending: false })

  if (error) throw new Error(`getBitacoras: ${error.message}`)

  return (data ?? []).map((b) => {
    const parcela = Array.isArray(b.parcelas) ? b.parcelas[0] : b.parcelas
    const productor = parcela
      ? Array.isArray(parcela.productores)
        ? parcela.productores[0]
        : parcela.productores
      : null
    return {
      id: b.id,
      parcela_id: b.parcela_id,
      anio: b.anio,
      parcela_codigo: parcela?.codigo_parcela ?? '',
      parcela_nombre: parcela?.nombre ?? null,
      productor_nombre: productor?.nombre_completo ?? '—',
    }
  })
}

// One bitácora (normalized grid). Returns null if not found.
export async function getBitacora(id: string): Promise<
  (BitacoraAnual & {
    parcela_codigo: string
    parcela_nombre: string | null
    productor_nombre: string
    comunidad: string | null
    tipo_cultivo: string
  }) | null
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bitacora_anual')
    .select(
      `id, parcela_id, anio, datos,
       parcelas ( codigo_parcela, nombre, comunidad, tipo_cultivo, productores ( nombre_completo ) )`,
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`getBitacora: ${error.message}`)
  if (!data) return null

  const parcela = Array.isArray(data.parcelas) ? data.parcelas[0] : data.parcelas
  const productor = parcela
    ? Array.isArray(parcela.productores)
      ? parcela.productores[0]
      : parcela.productores
    : null

  return {
    id: data.id,
    parcela_id: data.parcela_id,
    anio: data.anio,
    datos: normalizarDatos(data.datos),
    parcela_codigo: parcela?.codigo_parcela ?? '',
    parcela_nombre: parcela?.nombre ?? null,
    comunidad: parcela?.comunidad ?? null,
    tipo_cultivo: parcela?.tipo_cultivo ?? 'cafe',
    productor_nombre: productor?.nombre_completo ?? '—',
  }
}
