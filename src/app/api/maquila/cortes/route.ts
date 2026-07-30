// POST /api/maquila/cortes — captura NATIVA de un corte de maquila (Fase 1).
//
// Reemplaza el paso de "llenar el Excel y subirlo": el capturista elige las
// boletas de acopio que entraron al beneficio, teclea los sacos/kilos de
// salida por producto, y el servidor arma el corte completo.
//
// Nada de lo que decide la aritmética se confía al cliente: kg de entrada,
// factor de quintal, "sacos no enviados" y los avisos se RECALCULAN aquí con
// los mismos datos frescos que tiene la base en este instante (el saldo de
// una boleta pudo cambiar si alguien más capturó un corte mientras tanto).
//
// A diferencia del importador de Excel (que SIEMPRE guarda, avisos y todo,
// porque el documento real de bodega no se descarta aunque no cuadre), aquí
// los errores de nivel 'error' SÍ bloquean: es un formulario en vivo, no un
// documento histórico — tiene sentido pedir que se corrija antes de guardar.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { getBoletasDisponibles } from '@/lib/data/maquila'
import { KG_POR_QUINTAL_ORO } from '@/lib/maquila/importar.mjs'
import {
  totalKgResultado, sumaBoletas, calcularNoEnviados, validarCorteNativo, validarSaldoBoletas,
  type BoletaUso, type ResultadoInput, type LoteInput, type Cuadre, type Aviso,
} from '@/lib/maquila/captura'

export const dynamic = 'force-dynamic'

const num = (v: unknown) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v))
const txt = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

interface Body {
  fecha_corte?: string
  tipo_proceso?: 'maquila' | 'repaso_oro' | 'repaso_clasificadora'
  numero?: number | null
  usos?: { entrada_id: string; sacos: number; kg_netos: number }[]
  resultados?: { producto_id: string; sacos: number; kilos_sueltos: number; kg_por_saco: number }[]
  lotes?: { numero_lote: number; sacos: number; kg: number; descripcion?: string | null }[]
  cuadre?: Partial<Cuadre>
  observaciones?: string | null
  nombres?: { elaboro?: string; entrego?: string; retrillero?: string; calador?: string }
  firmas?: { elaboro?: string | null; entrego?: string | null; retrillero?: string | null; calador?: string | null }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const b = (await request.json().catch(() => null)) as Body | null
  if (!b) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const fechaCorte = txt(b.fecha_corte)
  const tipoProceso = b.tipo_proceso ?? 'maquila'
  const esRepasoClasificadora = tipoProceso === 'repaso_clasificadora'

  if (!['maquila', 'repaso_oro', 'repaso_clasificadora'].includes(tipoProceso)) {
    return NextResponse.json({ error: 'Tipo de proceso inválido' }, { status: 400 })
  }
  if (!esRepasoClasificadora && !(Number(b.numero) > 0)) {
    return NextResponse.json({ error: 'Falta el número de corte' }, { status: 400 })
  }

  const supabase = await createClient()

  // --- 1) Saldo fresco de las boletas: nunca el que trae el formulario ------
  const disponibles = await getBoletasDisponibles()
  const disponiblePorId = new Map(disponibles.map((d) => [d.id, d]))

  const usosBody = Array.isArray(b.usos) ? b.usos : []
  const usos: BoletaUso[] = usosBody.map((u) => {
    const d = disponiblePorId.get(u.entrada_id)
    const sacos = Math.max(0, num(u.sacos))
    const kgNetos = Math.max(0, num(u.kg_netos))
    return {
      entrada_id: u.entrada_id,
      folio: d?.folio ?? 0,
      especie: d?.especie ?? '',
      tipo: d?.tipo ?? '',
      proveedor_nombre: d?.proveedor_nombre ?? 'DESCONOCIDO',
      sacos,
      kg_netos: kgNetos,
      // kg_brutos/tara_kg del renglón son informativos (no entran en ningún
      // cálculo del corte): sin una tara propia de "esta porción", se guarda
      // kg_brutos = kg_netos y tara 0 en vez de inventar un prorrateo falso.
      kg_brutos: kgNetos,
      tara_kg: 0,
    }
  })

  const resultadosBody = Array.isArray(b.resultados) ? b.resultados : []
  const { data: catalogo, error: catErr } = await supabase
    .from('maquila_producto')
    .select('id, clave, nombre')
    .eq('activo', true)
  if (catErr) return NextResponse.json({ error: catErr.message }, { status: 400 })
  const productoPorId = new Map((catalogo ?? []).map((p) => [p.id as string, p]))

  const resultados: ResultadoInput[] = []
  for (const r of resultadosBody) {
    const p = productoPorId.get(r.producto_id)
    if (!p) return NextResponse.json({ error: `Producto desconocido en el catálogo: ${r.producto_id}` }, { status: 400 })
    const sacos = Math.max(0, num(r.sacos))
    const kilosSueltos = Math.max(0, num(r.kilos_sueltos))
    if (sacos === 0 && kilosSueltos === 0) continue // renglón vacío: se omite, no se guarda en 0
    resultados.push({
      producto_id: p.id as string,
      clave: p.clave as string,
      etiqueta: p.nombre as string,
      sacos,
      kilos_sueltos: kilosSueltos,
      kg_por_saco: num(r.kg_por_saco) || 69,
    })
  }

  const lotes: LoteInput[] = (Array.isArray(b.lotes) ? b.lotes : [])
    .filter((l) => Number(l.numero_lote) > 0)
    .map((l) => ({
      numero_lote: Number(l.numero_lote),
      sacos: Math.max(0, num(l.sacos)),
      kg: Math.max(0, num(l.kg)),
      descripcion: txt(l.descripcion),
    }))

  const cuadre: Cuadre = {
    sacos_enviados_lotes: Math.max(0, num(b.cuadre?.sacos_enviados_lotes)),
    sacos_maquilas_previas: Math.max(0, num(b.cuadre?.sacos_maquilas_previas)),
    sacos_torrefaccion: Math.max(0, num(b.cuadre?.sacos_torrefaccion)),
    sacos_venta: Math.max(0, num(b.cuadre?.sacos_venta)),
    sacos_otro_lote: Math.max(0, num(b.cuadre?.sacos_otro_lote)),
    sacos_repaso: Math.max(0, num(b.cuadre?.sacos_repaso)),
  }

  // --- 2) Avisos: los mismos que ve el capturista en vivo, recalculados -----
  const avisos: Aviso[] = [
    ...validarCorteNativo({ fechaCorte, tipoProceso, boletas: usos, resultados, lotes, cuadre }),
    ...validarSaldoBoletas(usos, disponiblePorId),
  ]
  const errores = avisos.filter((a) => a.nivel === 'error')
  if (errores.length > 0) {
    return NextResponse.json({ error: errores[0].mensaje, avisos }, { status: 400 })
  }
  if (resultados.length === 0) {
    return NextResponse.json({ error: 'Captura al menos un producto de salida.' }, { status: 400 })
  }

  // --- 3) Especie/tipo del corte: la de las boletas (todas son iguales, ya
  //        se validó arriba). Si no hay boletas (repaso de clasificadora), se
  //        toma del primer resultado como referencia mínima. ------------------
  const especie = usos[0]?.especie || 'ARABE'
  const tipoEntrada = usos[0]?.tipo || (tipoProceso === 'maquila' ? 'PERGAMINO' : 'ORO')

  const { data: producto } = await supabase
    .from('acopio_producto')
    .select('factor_quintal')
    .eq('especie', especie)
    .eq('tipo', tipoEntrada)
    .maybeSingle()
  const factor = producto?.factor_quintal ? Number(producto.factor_quintal) : null

  const { sacos: sacosEntrada, kg: kgEntrada } = sumaBoletas(usos)
  const numero = esRepasoClasificadora ? null : Number(b.numero)
  const clave = numero != null ? `M-${numero}` : `RC-${fechaCorte}`

  const oro = resultados.find((r) => r.clave === 'ORO_EXPORTACION')
  const sacosNoEnviados = calcularNoEnviados(oro?.sacos ?? 0, cuadre)
  const sacosCuadreTotal = oro?.sacos ?? 0
  const kgSalida = resultados.reduce((s, r) => s + totalKgResultado(r), 0)

  // --- 4) Escribir ------------------------------------------------------------
  const { data: maquila, error: mErr } = await supabase
    .from('maquilas')
    .insert({
      org_id: session.orgId,
      clave,
      numero,
      tipo_proceso: tipoProceso,
      fecha_corte: fechaCorte,
      especie,
      tipo_entrada: tipoEntrada,
      sacos_entrada: sacosEntrada,
      kg_entrada: kgEntrada,
      factor_quintal: factor,
      qq_entrada: factor ? kgEntrada / factor : null,
      sacos_enviados_lotes: cuadre.sacos_enviados_lotes,
      sacos_maquilas_previas: cuadre.sacos_maquilas_previas,
      sacos_torrefaccion: cuadre.sacos_torrefaccion,
      sacos_no_enviados: sacosNoEnviados,
      sacos_venta: cuadre.sacos_venta,
      sacos_otro_lote: cuadre.sacos_otro_lote,
      sacos_repaso: cuadre.sacos_repaso,
      sacos_cuadre_total: sacosCuadreTotal,
      observaciones: txt(b.observaciones),
      elaboro: txt(b.nombres?.elaboro),
      entrego: txt(b.nombres?.entrego),
      retrillero: txt(b.nombres?.retrillero),
      calador: txt(b.nombres?.calador),
      firma_elaboro_url: txt(b.firmas?.elaboro),
      firma_entrego_url: txt(b.firmas?.entrego),
      firma_retrillero_url: txt(b.firmas?.retrillero),
      firma_calador_url: txt(b.firmas?.calador),
      capturado_por: session.userId,
      avisos,
    })
    .select('id, clave')
    .single()

  if (mErr) {
    // Choque de "clave" (dos personas capturando el mismo número a la vez).
    if (mErr.code === '23505') {
      return NextResponse.json(
        { error: `Ya existe un corte con la clave ${clave}. Recarga la página para tomar el siguiente número.` },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: mErr.message }, { status: 400 })
  }
  const maquilaId = maquila.id as string

  if (usos.length > 0) {
    const { error } = await supabase.from('maquila_boleta').insert(
      usos.map((u) => ({
        org_id: session.orgId,
        maquila_id: maquilaId,
        folio: u.folio,
        entrada_id: u.entrada_id,
        proveedor_nombre: u.proveedor_nombre,
        tipo_cafe: `${u.especie} ${u.tipo}`.trim(),
        sacos: u.sacos,
        kg_brutos: u.kg_brutos,
        tara_kg: u.tara_kg,
        kg_netos: u.kg_netos,
        quintales: factor ? u.kg_netos / factor : null,
      })),
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const { error: rErr } = await supabase.from('maquila_resultado').insert(
    resultados.map((r) => ({
      org_id: session.orgId,
      maquila_id: maquilaId,
      producto_id: r.producto_id,
      sacos: r.sacos,
      kilos_sueltos: r.kilos_sueltos,
      kg_por_saco: r.kg_por_saco,
      total_kg: totalKgResultado(r),
      quintales: totalKgResultado(r) / KG_POR_QUINTAL_ORO,
      // rend_real (% de este producto sobre el oro total del corte) lo escribe
      // la app al insertar, igual que el importador de Excel: el trigger de
      // maquila_resultado sólo agrega totales en `maquilas`, no puede tocar su
      // propia tabla sin recursión infinita (ver 0024_maquila_fix_recursion.sql).
      rend_real: kgSalida > 0 ? totalKgResultado(r) / kgSalida : null,
    })),
  )
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 })

  if (lotes.length > 0) {
    const { error } = await supabase.from('maquila_lote').insert(
      lotes.map((l) => ({
        org_id: session.orgId,
        maquila_id: maquilaId,
        numero_lote: l.numero_lote,
        sacos: l.sacos,
        kg: l.kg,
        descripcion: l.descripcion,
      })),
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, id: maquilaId, clave, avisos })
}
