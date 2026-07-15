// POST /api/remisiones/[id]/recibir — el beneficio recibe una remisión.
//
// Escanea los sacos que REALMENTE llegaron y abre la boleta de entrada con los
// datos del productor ya puestos. El operador sólo hace las pesadas.
//
// Lo importante que pasa aquí: los sacos que salieron del campo y no se
// escanearon al llegar quedan SIN marcar, y la vista v_remision_cuadre los
// reporta como faltantes. Hoy esa diferencia no se puede ni preguntar, porque
// el café no tiene identidad hasta que llega.
//
// Body: { etiquetas: string[] }  (los códigos escaneados en la báscula)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { validarCodigo } from '@/lib/remision/codigo.mjs'

export const dynamic = 'force-dynamic'

// El tipado de supabase-js no infiere un select construido por concatenación
// (lo trata como GenericStringError). Se declara la forma que sí devuelve.
interface RemisionRow {
  id: string
  folio: number
  estado: string
  entrada_id: string | null
  productor_id: string | null
  proveedor_nombre: string
  comunidad: string | null
  municipio: string | null
  especie: string
  tipo: string
  material_saco: string | null
  total_sacos: number
  ciclo: string
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const b = await request.json().catch(() => null)
  const codigos: string[] = Array.isArray(b?.etiquetas) ? b.etiquetas : []

  const canonicos: string[] = []
  for (const c of codigos) {
    const v = validarCodigo(c)
    if (!v) return NextResponse.json({ error: `Código inválido: ${c}` }, { status: 400 })
    canonicos.push(v)
  }

  const supabase = await createClient()

  const { data, error: rErr } = await supabase
    .from('remisiones')
    .select(
      'id, folio, estado, entrada_id, productor_id, proveedor_nombre, comunidad, municipio,' +
        ' especie, tipo, material_saco, total_sacos, ciclo',
    )
    .eq('id', params.id)
    .maybeSingle()
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Remisión no encontrada' }, { status: 404 })
  const remision = data as unknown as RemisionRow
  if (remision.entrada_id) {
    return NextResponse.json(
      { error: 'Esta remisión ya se recibió y tiene boleta.' },
      { status: 409 },
    )
  }

  // Los sacos de ESTA remisión, con su código.
  const { data: sacos, error: sErr } = await supabase
    .from('remision_saco')
    .select('id, etiqueta ( codigo )')
    .eq('remision_id', remision.id)
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

  const idPorCodigo = new Map(
    (sacos ?? []).map((s) => [
      (s.etiqueta as unknown as { codigo: string } | null)?.codigo ?? '',
      s.id as string,
    ]),
  )

  // Un saco escaneado que no pertenece a esta remisión es un error de bodega
  // (o café de otro productor en la tarima). Se rechaza en vez de tragárselo.
  const ajenos = canonicos.filter((c) => !idPorCodigo.has(c))
  if (ajenos.length > 0) {
    return NextResponse.json(
      { error: `Estas etiquetas no son de la remisión ${remision.folio}: ${ajenos.join(', ')}` },
      { status: 400 },
    )
  }

  const ahora = new Date().toISOString()
  const idsRecibidos = canonicos.map((c) => idPorCodigo.get(c)!)
  if (idsRecibidos.length > 0) {
    const { error } = await supabase
      .from('remision_saco')
      .update({ recibido_at: ahora, recibido_por: session.userId })
      .in('id', idsRecibidos)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // La boleta nace con lo que ya sabemos del campo. Los kilos los pone la
  // báscula después (pesadas); aquí NO se inventa ningún peso.
  const { data: entrada, error: eErr } = await supabase
    .from('entradas')
    .insert({
      org_id: session.orgId,
      productor_id: remision.productor_id,
      proveedor_nombre: remision.proveedor_nombre,
      comunidad: remision.comunidad,
      municipio: remision.municipio,
      especie: remision.especie,
      tipo: remision.tipo,
      cosecha: remision.ciclo,
      remision_id: remision.id,
      elaborado_por: session.userId,
      estado: 'en_pesaje',
    })
    .select('id, folio')
    .single()
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })

  const { error: uErr } = await supabase
    .from('remisiones')
    .update({ estado: 'recibida', entrada_id: entrada.id, recibida_at: ahora, updated_at: ahora })
    .eq('id', remision.id)
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  const faltantes = (sacos ?? []).length - idsRecibidos.length

  return NextResponse.json({
    entrada_id: entrada.id,
    boleta_folio: entrada.folio,
    sacos_recibidos: idsRecibidos.length,
    sacos_faltantes: faltantes,
  })
}
