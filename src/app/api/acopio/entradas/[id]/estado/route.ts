// POST /api/acopio/entradas/[id]/estado — cambia el estado de la entrada.
// El SERVIDOR valida la transición, el rol y los requisitos (pesadas, calidad,
// firmas). No confía en lo que diga el cliente. Body: { estado }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionResult } from '@/lib/session'
import { puedeTransicionar, type EntradaEstado } from '@/lib/acopio/estado'
import type { EstadoEntrada } from '@/lib/acopio/tipos'

const ESTADOS: EstadoEntrada[] = [
  'borrador', 'en_pesaje', 'pendiente_calidad', 'lista_para_firma',
  'completada', 'pdf_generado', 'cancelada',
]

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const r = await getSessionResult()
  if (r.kind !== 'ok') return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { rol } = r.session

  const body = await request.json().catch(() => null)
  const hacia = body?.estado as EstadoEntrada
  if (!ESTADOS.includes(hacia)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const supabase = await createClient()

  // El select concatenado no lo infiere el cliente tipado de Supabase, de ahí
  // el cast (mismo patrón que el resto de lib/data).
  const { data, error: eErr } = await supabase
    .from('entradas')
    .select(
      'id, estado, especie, tipo, rendimiento, humedad,' +
        ' firma_receptor_url, firma_proveedor_url',
    )
    .eq('id', params.id)
    .maybeSingle()
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Entrada no encontrada' }, { status: 404 })
  const e = data as unknown as Omit<EntradaEstado, 'num_pesadas'>

  const { count } = await supabase
    .from('pesadas')
    .select('id', { count: 'exact', head: true })
    .eq('entrada_id', params.id)

  const actual: EntradaEstado = { ...e, num_pesadas: count ?? 0 }

  const evalu = puedeTransicionar(actual, hacia, rol)
  if (!evalu.ok) {
    return NextResponse.json({ error: evalu.motivos.join(' · ') }, { status: 409 })
  }

  const { error } = await supabase
    .from('entradas')
    .update({ estado: hacia, updated_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, estado: hacia })
}
