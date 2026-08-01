// Agroecología — Talleres (evento + plantilla): consultas del lado servidor.
import { createClient } from '@/lib/supabase/server'
import type { PlantillaTaller, Taller, TallerFoto, TallerRow, TallerDetalle } from '@/lib/agroecologia/taller-tipos'

export * from '@/lib/agroecologia/taller-tipos'

const numArr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : [])
const jsonArr = (v: unknown): string[] => {
  if (Array.isArray(v)) return v as string[]
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

function mapPlantilla(p: Record<string, unknown>): PlantillaTaller {
  return {
    id: p.id as string,
    programa_id: p.programa_id as string,
    tipo_taller_id: p.tipo_taller_id as string,
    nombre_taller: p.nombre_taller as string,
    participantes: (p.participantes as string) ?? null,
    asesores: (p.asesores as string) ?? null,
    introduccion: (p.introduccion as string) ?? null,
    objetivo_general: (p.objetivo_general as string) ?? null,
    objetivos_especificos: numArr(p.objetivos_especificos),
    ficha_descriptiva: jsonArr(p.ficha_descriptiva),
    desarrollo: (p.desarrollo as string) ?? null,
    acuerdos: (p.acuerdos as string) ?? null,
    conclusiones: (p.conclusiones as string) ?? null,
    origen_archivo: (p.origen_archivo as string) ?? null,
  }
}

function mapTaller(t: Record<string, unknown>): Taller {
  return {
    id: t.id as string,
    programa_id: t.programa_id as string,
    tipo_taller_id: t.tipo_taller_id as string,
    comunidad_id: (t.comunidad_id as string) ?? null,
    comunidad: t.comunidad as string,
    municipio: (t.municipio as string) ?? null,
    fecha: t.fecha as string,
    hora_inicio: (t.hora_inicio as string) ?? null,
    hora_fin: (t.hora_fin as string) ?? null,
    tecnico: (t.tecnico as string) ?? null,
    notas: (t.notas as string) ?? null,
    observaciones: (t.observaciones as string) ?? null,
    lista_id: (t.lista_id as string) ?? null,
    historico: Boolean(t.historico),
    origen_archivo: (t.origen_archivo as string) ?? null,
  }
}

export interface FiltrosTaller {
  programaId?: string | null
  tipoTallerId?: string | null
  comunidadId?: string | null
  desde?: string | null
  hasta?: string | null
}

export async function getTalleres(f: FiltrosTaller = {}): Promise<TallerRow[]> {
  const supabase = await createClient()

  let q = supabase
    .from('agro_taller')
    .select(
      'id, programa_id, tipo_taller_id, comunidad_id, comunidad, municipio, fecha, hora_inicio,' +
        ' hora_fin, tecnico, notas, observaciones, lista_id, historico, origen_archivo,' +
        ' agro_tipo_taller ( nombre ), agro_programa ( nombre ), agro_taller_foto ( id )',
    )
    .order('fecha', { ascending: false })
    .limit(2000)

  if (f.programaId) q = q.eq('programa_id', f.programaId)
  if (f.tipoTallerId) q = q.eq('tipo_taller_id', f.tipoTallerId)
  if (f.comunidadId) q = q.eq('comunidad_id', f.comunidadId)
  if (f.desde) q = q.gte('fecha', f.desde)
  if (f.hasta) q = q.lte('fecha', f.hasta)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  interface Row extends Record<string, unknown> {
    agro_tipo_taller: { nombre: string } | { nombre: string }[] | null
    agro_programa: { nombre: string } | { nombre: string }[] | null
    agro_taller_foto: { id: string }[] | null
  }

  const rows = (data ?? []) as unknown as Row[]

  // Conteo de asistentes por lista, en un solo viaje (evita N+1).
  const listaIds = rows.map((r) => r.lista_id as string | null).filter((x): x is string => !!x)
  const conteoPorLista = new Map<string, number>()
  if (listaIds.length > 0) {
    const { data: regs } = await supabase
      .from('asistencia_registro')
      .select('lista_id')
      .in('lista_id', listaIds)
      .limit(20000)
    for (const r of regs ?? []) {
      const id = r.lista_id as string
      conteoPorLista.set(id, (conteoPorLista.get(id) ?? 0) + 1)
    }
  }

  return rows.map((r) => {
    const tipo = Array.isArray(r.agro_tipo_taller) ? r.agro_tipo_taller[0] : r.agro_tipo_taller
    const prog = Array.isArray(r.agro_programa) ? r.agro_programa[0] : r.agro_programa
    return {
      ...mapTaller(r),
      tipo_nombre: tipo?.nombre ?? '—',
      programa_nombre: prog?.nombre ?? '—',
      n_fotos: (r.agro_taller_foto ?? []).length,
      n_asistentes: r.lista_id ? (conteoPorLista.get(r.lista_id as string) ?? 0) : null,
    }
  })
}

export async function getTallerDetalle(id: string): Promise<TallerDetalle | null> {
  const supabase = await createClient()

  const { data: t, error } = await supabase
    .from('agro_taller')
    .select(
      'id, programa_id, tipo_taller_id, comunidad_id, comunidad, municipio, fecha, hora_inicio,' +
        ' hora_fin, tecnico, notas, observaciones, lista_id, historico, origen_archivo,' +
        ' agro_tipo_taller ( nombre ), agro_programa ( nombre )',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!t) return null

  const tt = t as unknown as Record<string, unknown> & {
    agro_tipo_taller: { nombre: string } | { nombre: string }[] | null
    agro_programa: { nombre: string } | { nombre: string }[] | null
  }
  const taller = mapTaller(tt)
  const tipo = Array.isArray(tt.agro_tipo_taller) ? tt.agro_tipo_taller[0] : tt.agro_tipo_taller
  const prog = Array.isArray(tt.agro_programa) ? tt.agro_programa[0] : tt.agro_programa

  const [{ data: plantilla }, { data: fotos }, asistentes] = await Promise.all([
    supabase
      .from('agro_plantilla_taller')
      .select('*')
      .eq('programa_id', taller.programa_id)
      .eq('tipo_taller_id', taller.tipo_taller_id)
      .maybeSingle(),
    supabase
      .from('agro_taller_foto')
      .select('id, url, descripcion, orden')
      .eq('taller_id', id)
      .order('orden', { ascending: true }),
    taller.lista_id
      ? supabase
          .from('asistencia_registro')
          .select('nombre_completo, sexo, organizacion')
          .eq('lista_id', taller.lista_id)
          .order('numero', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  return {
    taller,
    tipo_nombre: tipo?.nombre ?? '—',
    programa_nombre: prog?.nombre ?? '—',
    plantilla: plantilla ? mapPlantilla(plantilla) : null,
    fotos: (fotos ?? []) as unknown as TallerFoto[],
    asistentes: (asistentes.data ?? []) as { nombre_completo: string; sexo: string | null; organizacion: string | null }[],
  }
}

export async function getPlantillas(): Promise<(PlantillaTaller & { tipo_nombre: string; programa_nombre: string })[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agro_plantilla_taller')
    .select('*, agro_tipo_taller ( nombre, orden ), agro_programa ( nombre, ciclo )')
    .limit(200)
  if (error) throw new Error(error.message)

  interface Row extends Record<string, unknown> {
    agro_tipo_taller: { nombre: string; orden: number } | { nombre: string; orden: number }[] | null
    agro_programa: { nombre: string; ciclo: string } | { nombre: string; ciclo: string }[] | null
  }

  return ((data ?? []) as unknown as Row[])
    .map((p) => {
      const tipo = Array.isArray(p.agro_tipo_taller) ? p.agro_tipo_taller[0] : p.agro_tipo_taller
      const prog = Array.isArray(p.agro_programa) ? p.agro_programa[0] : p.agro_programa
      return {
        ...mapPlantilla(p),
        tipo_nombre: tipo?.nombre ?? '—',
        programa_nombre: prog ? `${prog.nombre} ${prog.ciclo}` : '—',
        _orden: tipo?.orden ?? 0,
      }
    })
    .sort((a, b) => a.programa_nombre.localeCompare(b.programa_nombre, 'es') || a._orden - b._orden)
}

export interface ComunidadPicker {
  id: string
  comunidad: string
  municipio: string | null
  socios: number
}

export async function getComunidadesPrograma(programaId: string): Promise<ComunidadPicker[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agro_comunidad')
    .select('id, comunidad, municipio, socios')
    .eq('programa_id', programaId)
    .order('comunidad', { ascending: true })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ComunidadPicker[]
}

export interface TipoTallerPicker {
  id: string
  clave: string
  nombre: string
  orden: number
}

export async function getTiposTallerPrograma(programaId: string): Promise<TipoTallerPicker[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agro_tipo_taller')
    .select('id, clave, nombre, orden')
    .eq('programa_id', programaId)
    .order('orden', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as TipoTallerPicker[]
}
