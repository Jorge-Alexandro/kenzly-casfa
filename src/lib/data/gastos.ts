// Gastos por programa — consultas server-side. Las tres tablas están detrás de
// la RLS es_contador: si quien consulta no es admin/contador, no ve ni una fila.
import { createClient } from '@/lib/supabase/server'
import type { Gasto, ProgramaGasto } from '@/lib/gastos/tipos'

export * from '@/lib/gastos/tipos'

export interface FiltrosGasto {
  programa?: string | null // clave del programa (CERTIFICACION / AGROECOLOGIA)
  desde?: string | null
  hasta?: string | null
}

/** Programas con su catálogo de categorías (las columnas de su Excel). */
export async function getProgramas(): Promise<ProgramaGasto[]> {
  const supabase = await createClient()
  const [prog, cat] = await Promise.all([
    supabase.from('gasto_programa').select('id, clave, nombre, orden, activo').order('orden'),
    supabase
      .from('gasto_categoria')
      .select('id, programa_id, nombre, orden, activo')
      .order('orden'),
  ])
  if (prog.error) throw new Error(prog.error.message)
  if (cat.error) throw new Error(cat.error.message)

  const porPrograma = new Map<string, ProgramaGasto['categorias']>()
  for (const c of cat.data ?? []) {
    const k = c.programa_id as string
    const arr = porPrograma.get(k) ?? []
    arr.push({
      id: c.id as string,
      nombre: c.nombre as string,
      orden: Number(c.orden),
      activo: Boolean(c.activo),
    })
    porPrograma.set(k, arr)
  }

  return (prog.data ?? [])
    .filter((p) => p.activo)
    .map((p) => ({
      id: p.id as string,
      clave: p.clave as string,
      nombre: p.nombre as string,
      orden: Number(p.orden),
      categorias: (porPrograma.get(p.id as string) ?? []).filter((c) => c.activo),
    }))
}

/** Movimientos del periodo, ordenados por fecha (como su libro). */
export async function getGastos(f: FiltrosGasto): Promise<Gasto[]> {
  const supabase = await createClient()

  let programaId: string | null = null
  if (f.programa) {
    const { data } = await supabase
      .from('gasto_programa')
      .select('id')
      .eq('clave', f.programa)
      .maybeSingle()
    programaId = (data?.id as string) ?? null
    if (!programaId) return []
  }

  let q = supabase
    .from('gasto')
    .select('id, programa_id, categoria_id, fecha, monto, concepto, beneficiario, comprobante')
    .order('fecha', { ascending: true })
    .limit(5000)
  if (programaId) q = q.eq('programa_id', programaId)
  if (f.desde) q = q.gte('fecha', f.desde)
  if (f.hasta) q = q.lte('fecha', f.hasta)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  return (data ?? []).map((g) => ({
    id: g.id as string,
    programa_id: g.programa_id as string,
    categoria_id: g.categoria_id as string,
    fecha: g.fecha as string,
    monto: Number(g.monto),
    concepto: (g.concepto as string) ?? null,
    beneficiario: (g.beneficiario as string) ?? null,
    comprobante: (g.comprobante as string) ?? null,
  }))
}
