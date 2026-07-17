// POST /api/productores — alta de un productor nuevo (con GPS opcional) y sus
// parcelas iniciales. Abierto a TODOS los miembros (los inspectores también dan
// de alta en campo — confirmado por Jorge tras CHESPAL).
//
// Body: {
//   codigo, nombre_completo, sexo?, comunidad?, municipio?, anio_ingreso?,
//   tipo_productor, lat?, lng?, gps_precision_m?,
//   parcelas?: [{ nombre, superficie_ha?, tipo_cultivo }]
// }
// El código de cada parcela se genera como <codigo>-<A|B|C…> (esquema SIC).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const codigo = String(body.codigo ?? '').trim().toUpperCase()
  const nombre = String(body.nombre_completo ?? '').trim()
  const tipo = String(body.tipo_productor ?? '').trim()
  if (!codigo) return NextResponse.json({ error: 'Falta el código del productor' }, { status: 400 })
  if (!nombre) return NextResponse.json({ error: 'Falta el nombre completo' }, { status: 400 })
  if (!['cafe', 'tropical', 'mixto'].includes(tipo)) {
    return NextResponse.json({ error: 'Tipo de productor inválido' }, { status: 400 })
  }

  const supabase = await createClient()

  // Código único dentro de la org (RLS limita la vista a la org del usuario).
  const { data: existente } = await supabase
    .from('productores')
    .select('id')
    .eq('codigo', codigo)
    .maybeSingle()
  if (existente) {
    return NextResponse.json({ error: `Ya existe un productor con el código ${codigo}` }, { status: 409 })
  }

  const lat = typeof body.lat === 'number' ? body.lat : null
  const lng = typeof body.lng === 'number' ? body.lng : null

  const { data: prod, error: pErr } = await supabase
    .from('productores')
    .insert({
      org_id: session.orgId,
      codigo,
      nombre_completo: nombre,
      sexo: body.sexo?.trim() || null,
      comunidad: body.comunidad?.trim() || null,
      municipio: body.municipio?.trim() || null,
      anio_ingreso: body.anio_ingreso ?? null,
      tipo_productor: tipo,
      lat,
      lng,
      gps_precision_m: typeof body.gps_precision_m === 'number' ? body.gps_precision_m : null,
    })
    .select('id')
    .single()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 })

  // Parcelas iniciales: código = <codigoProductor>-<letra> (esquema SIC A/B/C).
  const parcelas = Array.isArray(body.parcelas) ? body.parcelas : []
  const filas = parcelas
    .map((p: { nombre?: string; superficie_ha?: number; tipo_cultivo?: string }, i: number) => ({
      org_id: session.orgId,
      productor_id: prod.id,
      codigo_parcela: `${codigo}-${LETRAS[i] ?? String(i + 1)}`,
      nombre: String(p.nombre ?? '').trim() || null,
      comunidad: body.comunidad?.trim() || null,
      municipio: body.municipio?.trim() || null,
      tipo_cultivo: ['cafe', 'tropical'].includes(String(p.tipo_cultivo)) ? p.tipo_cultivo : (tipo === 'tropical' ? 'tropical' : 'cafe'),
      superficie_declarada_ha:
        typeof p.superficie_ha === 'number' && p.superficie_ha > 0 ? p.superficie_ha : null,
    }))
    .filter((p: { nombre: string | null }) => p.nombre !== null)

  if (filas.length > 0) {
    const { error: paErr } = await supabase.from('parcelas').insert(filas)
    if (paErr) {
      return NextResponse.json(
        { error: `Productor creado, pero falló el alta de parcelas: ${paErr.message}`, productor_id: prod.id },
        { status: 207 },
      )
    }
  }

  return NextResponse.json({ ok: true, productor_id: prod.id, parcelas: filas.length })
}
