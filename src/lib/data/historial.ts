// Server-side data access for the Historial module.
import { createClient } from '@/lib/supabase/server'
import type { HistorialAnio } from '@/lib/historial'

// Parcelas that already have at least one historial row (for the picker list).
export interface ParcelaConHistorial {
  parcela_id: string
  parcela_codigo: string
  parcela_nombre: string | null
  productor_nombre: string
  anios: number[]
}

export async function getParcelasConHistorial(): Promise<ParcelaConHistorial[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('historial_manejo_anual')
    .select(
      `parcela_id, anio,
       parcelas ( codigo_parcela, nombre, productores ( nombre_completo ) )`,
    )
    .order('anio', { ascending: false })

  if (error) throw new Error(`getParcelasConHistorial: ${error.message}`)

  const byParcela = new Map<string, ParcelaConHistorial>()
  for (const row of data ?? []) {
    const parcela = Array.isArray(row.parcelas) ? row.parcelas[0] : row.parcelas
    const productor = parcela
      ? Array.isArray(parcela.productores)
        ? parcela.productores[0]
        : parcela.productores
      : null
    const existing = byParcela.get(row.parcela_id)
    if (existing) {
      existing.anios.push(row.anio)
    } else {
      byParcela.set(row.parcela_id, {
        parcela_id: row.parcela_id,
        parcela_codigo: parcela?.codigo_parcela ?? '',
        parcela_nombre: parcela?.nombre ?? null,
        productor_nombre: productor?.nombre_completo ?? '—',
        anios: [row.anio],
      })
    }
  }
  return Array.from(byParcela.values())
}

export interface HistorialParcela {
  parcela_id: string
  parcela_codigo: string
  parcela_nombre: string | null
  productor_nombre: string
  comunidad: string | null
  municipio: string | null
  tipo_cultivo: string
  anios: HistorialAnio[]
}

// Full historial (all years) for a parcela.
export async function getHistorialParcela(
  parcelaId: string,
): Promise<HistorialParcela | null> {
  const supabase = await createClient()

  const { data: parcela, error: paErr } = await supabase
    .from('parcelas')
    .select(
      'id, codigo_parcela, nombre, comunidad, municipio, tipo_cultivo, productores ( nombre_completo )',
    )
    .eq('id', parcelaId)
    .maybeSingle()
  if (paErr) throw new Error(`getHistorialParcela (parcela): ${paErr.message}`)
  if (!parcela) return null

  const productor = Array.isArray(parcela.productores)
    ? parcela.productores[0]
    : parcela.productores

  const { data: rows, error: hErr } = await supabase
    .from('historial_manejo_anual')
    .select('id, anio, datos')
    .eq('parcela_id', parcelaId)
    .order('anio', { ascending: true })
  if (hErr) throw new Error(`getHistorialParcela (historial): ${hErr.message}`)

  const anios: HistorialAnio[] = (rows ?? []).map((r) => ({
    id: r.id,
    anio: r.anio,
    datos: (r.datos ?? {}) as HistorialAnio['datos'],
  }))

  return {
    parcela_id: parcela.id,
    parcela_codigo: parcela.codigo_parcela,
    parcela_nombre: parcela.nombre,
    productor_nombre: productor?.nombre_completo ?? '—',
    comunidad: parcela.comunidad,
    municipio: parcela.municipio,
    tipo_cultivo: parcela.tipo_cultivo,
    anios,
  }
}
