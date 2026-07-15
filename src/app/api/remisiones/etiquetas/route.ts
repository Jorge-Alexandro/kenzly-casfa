// POST /api/remisiones/etiquetas — genera una tanda de etiquetas para imprimir.
//
// Los códigos se crean AQUÍ y se guardan antes de imprimirse. Ese registro es
// lo que permite responderle a un auditor orgánico la pregunta incómoda:
// "¿esta etiqueta se imprimió, o apareció?". Una etiqueta que no está en la
// base se rechaza al sincronizar la remisión.
//
// Body: { ciclo: string, cantidad: number }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { generarRango } from '@/lib/remision/codigo.mjs'

export const dynamic = 'force-dynamic'

const PREFIJO = 'CAS'
const MAX_TANDA = 2000

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const b = await request.json().catch(() => null)
  const ciclo = typeof b?.ciclo === 'string' ? b.ciclo : ''
  const cantidad = Number(b?.cantidad)

  if (!ciclo) return NextResponse.json({ error: 'Falta el ciclo' }, { status: 400 })
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_TANDA) {
    return NextResponse.json(
      { error: `La cantidad debe estar entre 1 y ${MAX_TANDA}` },
      { status: 400 },
    )
  }

  const supabase = await createClient()

  // Siguiente consecutivo del ciclo. Se toma del último impreso, no de un
  // count(): si alguna vez se borra una etiqueta, no queremos reutilizar su
  // código y que dos sacos de años distintos compartan identidad.
  const { data: ultima } = await supabase
    .from('etiqueta_impresion')
    .select('hasta')
    .eq('ciclo', ciclo)
    .order('hasta', { ascending: false })
    .limit(1)
    .maybeSingle()

  const desde = (ultima?.hasta ?? 0) + 1
  const hasta = desde + cantidad - 1
  const rango = generarRango(PREFIJO, ciclo, desde, cantidad)

  const { data: impresion, error: iErr } = await supabase
    .from('etiqueta_impresion')
    .insert({
      org_id: session.orgId,
      ciclo,
      prefijo: PREFIJO,
      desde,
      hasta,
      cantidad,
      creada_por: session.userId,
    })
    .select('id')
    .single()
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 })

  const { error: eErr } = await supabase.from('etiqueta').insert(
    rango.map((r) => ({
      org_id: session.orgId,
      codigo: r.codigo,
      ciclo,
      impresion_id: impresion.id,
    })),
  )
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })

  return NextResponse.json({
    impresion_id: impresion.id,
    ciclo,
    desde,
    hasta,
    codigos: rango.map((r) => r.codigo),
  })
}
