// Listas de asistencia (Server Components). RLS acota por organización.
import { createClient } from '@/lib/supabase/server'

export interface AsistenciaListaRow {
  id: string
  folio: number
  nombre_evento: string
  fecha: string
  lugar: string | null
  capacitador: string | null
  cerrada: boolean
  created_at: string
  num_participantes: number
}

export interface AsistenciaRegistro {
  id: string
  numero: number
  nombre_completo: string
  organizacion: string | null
  sexo: string | null
  cargo: string | null
  telefono: string | null
  correo: string | null
  firma_url: string | null
}

export interface AsistenciaListaDetalle {
  id: string
  folio: number
  nombre_evento: string
  fecha: string
  lugar: string | null
  capacitador: string | null
  cerrada: boolean
  registros: AsistenciaRegistro[]
}

export async function getListasAsistencia(): Promise<AsistenciaListaRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('asistencia_lista')
    .select('id, folio, nombre_evento, fecha, lugar, capacitador, cerrada, created_at, asistencia_registro(id)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`getListasAsistencia: ${error.message}`)
  return (data ?? []).map((l) => ({
    id: l.id,
    folio: l.folio,
    nombre_evento: l.nombre_evento,
    fecha: l.fecha,
    lugar: l.lugar,
    capacitador: l.capacitador,
    cerrada: l.cerrada,
    created_at: l.created_at,
    num_participantes: (l.asistencia_registro as unknown[])?.length ?? 0,
  }))
}

export async function getListaAsistencia(id: string): Promise<AsistenciaListaDetalle | null> {
  const supabase = await createClient()
  const { data: lista, error } = await supabase
    .from('asistencia_lista')
    .select('id, folio, nombre_evento, fecha, lugar, capacitador, cerrada')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getListaAsistencia: ${error.message}`)
  if (!lista) return null

  const { data: regs, error: rErr } = await supabase
    .from('asistencia_registro')
    .select('id, numero, nombre_completo, organizacion, sexo, cargo, telefono, correo, firma_url')
    .eq('lista_id', id)
    .order('numero', { ascending: true })
  if (rErr) throw new Error(`getListaAsistencia registros: ${rErr.message}`)

  return { ...lista, registros: (regs ?? []) as AsistenciaRegistro[] }
}
