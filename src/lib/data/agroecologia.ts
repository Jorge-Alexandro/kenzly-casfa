// Agroecología — Programa/talleres/avances: consultas del lado servidor.
import { createClient } from '@/lib/supabase/server'
import type {
  ProgramaLite,
  TipoTaller,
  ComunidadRow,
  AvanceCell,
  AgroKpis,
  Matriz,
} from '@/lib/agroecologia/programa-tipos'

export * from '@/lib/agroecologia/programa-tipos'

export async function getProgramas(): Promise<ProgramaLite[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agro_programa')
    .select('id, nombre, ciclo')
    .order('nombre', { ascending: true })
    .order('ciclo', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ProgramaLite[]
}

export async function getMatriz(programaId: string): Promise<Matriz | null> {
  const supabase = await createClient()

  const { data: prog } = await supabase
    .from('agro_programa')
    .select('id, nombre, ciclo')
    .eq('id', programaId)
    .maybeSingle()
  if (!prog) return null

  const [{ data: tipos }, { data: coms }, { data: avs }] = await Promise.all([
    supabase
      .from('agro_tipo_taller')
      .select('id, clave, nombre, orden')
      .eq('programa_id', programaId)
      .order('orden', { ascending: true }),
    supabase
      .from('agro_comunidad')
      .select('id, comunidad, municipio, socios, hectareas, plantas_entregadas, abono_ton, orden')
      .eq('programa_id', programaId)
      .order('orden', { ascending: true })
      .limit(5000),
    supabase
      .from('agro_avance')
      .select('comunidad_id, tipo_taller_id, impartido, f, m, avance')
      .eq('programa_id', programaId)
      .limit(20000),
  ])

  const comunidades = (coms ?? []) as unknown as ComunidadRow[]
  const avances = (avs ?? []) as unknown as AvanceCell[]

  // KPIs
  let asistencias = 0, f = 0, m = 0, impartidos = 0, sumAvance = 0
  for (const a of avances) {
    f += a.f
    m += a.m
    asistencias += a.f + a.m
    if (a.impartido) {
      impartidos += 1
      sumAvance += Number(a.avance)
    }
  }
  const socios = comunidades.reduce((s, c) => s + c.socios, 0)
  const superficie = comunidades.reduce((s, c) => s + Number(c.hectareas), 0)
  const plantas = comunidades.reduce((s, c) => s + c.plantas_entregadas, 0)
  const abono = comunidades.reduce((s, c) => s + Number(c.abono_ton), 0)

  const kpis: AgroKpis = {
    comunidades: comunidades.length,
    socios,
    talleres_impartidos: impartidos,
    asistencias,
    f,
    m,
    superficie: Math.round(superficie * 100) / 100,
    plantas,
    abono: Math.round(abono * 1000) / 1000,
    pct_asistencia: impartidos ? Math.round((sumAvance / impartidos) * 1000) / 1000 : 0,
  }

  return {
    programa: prog as unknown as ProgramaLite,
    tipos: (tipos ?? []) as unknown as TipoTaller[],
    comunidades,
    avances,
    kpis,
  }
}
