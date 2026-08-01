// PATCH /api/agroecologia/plantillas/[id] — edita el texto fijo de un taller.
// Body: cualquiera de { nombre_taller, participantes, asesores, introduccion,
//   objetivo_general, objetivos_especificos[], ficha_descriptiva[], desarrollo,
//   acuerdos, conclusiones }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

const txt = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

const CAMPOS_TEXTO = [
  'nombre_taller', 'participantes', 'asesores', 'introduccion',
  'objetivo_general', 'desarrollo', 'acuerdos', 'conclusiones',
] as const

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const b = await request.json().catch(() => null)
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const c of CAMPOS_TEXTO) {
    if (Object.prototype.hasOwnProperty.call(b, c)) cambios[c] = txt(b[c])
  }
  if (Array.isArray(b.objetivos_especificos)) {
    cambios.objetivos_especificos = b.objetivos_especificos.map(String).filter((x: string) => x.trim())
  }
  if (Array.isArray(b.ficha_descriptiva)) {
    cambios.ficha_descriptiva = b.ficha_descriptiva.map(String)
  }
  // nombre_taller no puede quedar vacío: es lo que titula el reporte.
  if ('nombre_taller' in cambios && !cambios.nombre_taller) {
    return NextResponse.json({ error: 'El nombre del taller no puede quedar vacío' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agro_plantilla_taller')
    .update(cambios)
    .eq('id', params.id)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
