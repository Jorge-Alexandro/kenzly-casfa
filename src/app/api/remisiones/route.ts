// POST /api/remisiones — recibe una remisión capturada en campo (posiblemente
// días después, cuando el promotor vuelve a tener señal).
//
// IDEMPOTENTE por local_id: el celular genera ese uuid. Si la red se cae
// después de que el servidor guardó pero antes de que llegara la respuesta, el
// promotor reintenta y aquí se hace UPDATE, no un duplicado. Sin esto, la
// sincronización intermitente de la sierra produce remisiones fantasma.
//
// Las etiquetas se validan de nuevo aquí (dígito verificador + que existan +
// que no estén usadas): el cliente ya lo hizo, pero el cliente no es autoridad.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { validarCodigo } from '@/lib/remision/codigo.mjs'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const b = await request.json().catch(() => null)
  if (!b?.local_id) return NextResponse.json({ error: 'Falta local_id' }, { status: 400 })
  if (!b?.proveedor_nombre) {
    return NextResponse.json({ error: 'Falta el productor' }, { status: 400 })
  }

  const codigos: string[] = Array.isArray(b.etiquetas) ? b.etiquetas : []
  const canonicos: string[] = []
  for (const c of codigos) {
    const v = validarCodigo(c)
    if (!v) return NextResponse.json({ error: `Código inválido: ${c}` }, { status: 400 })
    canonicos.push(v)
  }
  if (new Set(canonicos).size !== canonicos.length) {
    return NextResponse.json({ error: 'Hay etiquetas repetidas en la remisión' }, { status: 400 })
  }

  const supabase = await createClient()

  // Las etiquetas tienen que existir (se imprimieron) y estar libres.
  let etiquetaIds: string[] = []
  if (canonicos.length > 0) {
    const { data: etiquetas, error } = await supabase
      .from('etiqueta')
      .select('id, codigo, usada')
      .in('codigo', canonicos)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const porCodigo = new Map((etiquetas ?? []).map((e) => [e.codigo as string, e]))

    const inexistentes = canonicos.filter((c) => !porCodigo.has(c))
    if (inexistentes.length > 0) {
      return NextResponse.json(
        {
          error:
            `Estas etiquetas no existen en el sistema (¿se imprimieron?): ` +
            inexistentes.join(', '),
        },
        { status: 400 },
      )
    }

    // Una etiqueta usada por OTRA remisión es un saco contado dos veces.
    // Si es de ESTA misma remisión (reintento de sync), no es conflicto.
    const { data: previa } = await supabase
      .from('remisiones')
      .select('id')
      .eq('local_id', b.local_id)
      .maybeSingle()

    const usadas = (etiquetas ?? []).filter((e) => e.usada)
    if (usadas.length > 0 && !previa) {
      const { data: enUso } = await supabase
        .from('remision_saco')
        .select('etiqueta_id, remisiones ( folio )')
        .in(
          'etiqueta_id',
          usadas.map((e) => e.id),
        )
      const folios = Array.from(
        new Set(
          (enUso ?? []).map(
            (s) => (s.remisiones as unknown as { folio: number } | null)?.folio ?? '?',
          ),
        ),
      )
      return NextResponse.json(
        {
          error:
            `Estas etiquetas ya se usaron en la remisión ${folios.join(', ')}: ` +
            usadas.map((e) => e.codigo).join(', '),
        },
        { status: 409 },
      )
    }

    etiquetaIds = canonicos.map((c) => porCodigo.get(c)!.id as string)
  }

  const { data: remision, error: rErr } = await supabase
    .from('remisiones')
    .upsert(
      {
        org_id: session.orgId,
        local_id: b.local_id,
        fecha_remision: b.fecha_remision,
        ciclo: b.ciclo,
        productor_id: b.productor_id ?? null,
        proveedor_nombre: b.proveedor_nombre,
        comunidad: b.comunidad ?? null,
        municipio: b.municipio ?? null,
        especie: b.especie,
        tipo: b.tipo,
        material_saco: b.material_saco ?? null,
        total_sacos: b.total_sacos ?? canonicos.length,
        kg_declarado: b.kg_declarado ?? null,
        observaciones: b.observaciones ?? null,
        promotor_id: session.userId,
        lat: b.lat ?? null,
        lng: b.lng ?? null,
      },
      { onConflict: 'org_id,local_id' },
    )
    .select('id, folio')
    .single()
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  // Sacos: se reemplazan. Un reenvío puede traer la lista corregida.
  await supabase.from('remision_saco').delete().eq('remision_id', remision.id)

  if (etiquetaIds.length > 0) {
    const { error } = await supabase.from('remision_saco').insert(
      etiquetaIds.map((etiqueta_id, i) => ({
        org_id: session.orgId,
        remision_id: remision.id,
        etiqueta_id,
        orden: i + 1,
      })),
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    id: remision.id,
    folio: remision.folio,
    sacos: etiquetaIds.length,
  })
}
