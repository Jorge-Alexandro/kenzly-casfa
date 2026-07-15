// Agroecología — Estimación de cosecha: consultas del lado servidor.
// RLS acota por organización; los tipos puros viven en @/lib/agroecologia/tipos.
import { createClient } from '@/lib/supabase/server'
import type {
  EstimacionRow,
  Reglas,
  ReglaCafe,
  ReglaCacao,
  ParcelaLite,
} from '@/lib/agroecologia/tipos'

export * from '@/lib/agroecologia/tipos'

// Defaults por si la org aún no tiene fila en estimacion_regla.
const CAFE_DEFAULT: ReglaCafe = {
  constante: 640000,
  oro_kg: 45.35,
  kg_por_quintal: { cafe_robusta: 80, cafe_arabe: 57.5, oro: 45.35 },
  factores: [
    { hasta: 35, factor: 51 },
    { hasta: 75, factor: 100 },
    { hasta: null, factor: 162 },
  ],
}
const CACAO_DEFAULT: ReglaCacao = { im: 22, muestra_arboles: 10 }

export async function getReglas(): Promise<Reglas> {
  const supabase = await createClient()
  const { data } = await supabase.from('estimacion_regla').select('metodo, params')
  const byMetodo: Record<string, unknown> = {}
  for (const r of data ?? []) byMetodo[r.metodo] = r.params
  return {
    cafe: { ...CAFE_DEFAULT, ...((byMetodo.cafe as Partial<ReglaCafe>) ?? {}) },
    cacao: { ...CACAO_DEFAULT, ...((byMetodo.cacao as Partial<ReglaCacao>) ?? {}) },
  }
}

export async function getEstimaciones(): Promise<EstimacionRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('estimacion_cosecha')
    .select(
      'id, ciclo, cultivo, metodo, kg_estimado, valor_final_kg, fecha,' +
        ' parcelas ( nombre, codigo_parcela ), productores ( nombre_completo )',
    )
    .order('fecha', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const parcela = pickOne(r.parcelas) as Record<string, unknown> | null
    const productor = pickOne(r.productores) as Record<string, unknown> | null
    return {
      id: r.id as string,
      ciclo: r.ciclo as string,
      cultivo: r.cultivo as string,
      metodo: r.metodo as EstimacionRow['metodo'],
      parcela_nombre: (parcela?.nombre as string) ?? null,
      parcela_codigo: (parcela?.codigo_parcela as string) ?? null,
      proveedor_nombre: (productor?.nombre_completo as string) ?? null,
      kg_estimado: r.kg_estimado as number | null,
      valor_final_kg: r.valor_final_kg as number | null,
      fecha: r.fecha as string,
    }
  })
}

export async function getParcelasDeProductor(productorId: string): Promise<ParcelaLite[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('parcelas')
    .select('id, codigo_parcela, nombre, superficie_declarada_ha, tipo_cultivo')
    .eq('productor_id', productorId)
    .order('codigo_parcela', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((p) => ({
    id: p.id as string,
    codigo_parcela: p.codigo_parcela as string,
    nombre: (p.nombre as string) ?? null,
    superficie_ha: (p.superficie_declarada_ha as number) ?? null,
    tipo_cultivo: p.tipo_cultivo as string,
  }))
}

function pickOne(v: unknown): unknown {
  return Array.isArray(v) ? v[0] ?? null : v ?? null
}
