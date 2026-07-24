// Contabilidad — consultas server-side. El costo vive en entrada_costo, cuya
// RLS sólo deja entrar a admin/contador: el operativo no ve estas filas.
import { createClient } from '@/lib/supabase/server'
import type { BoletaCosto, MaquilaCosto, Pago, Factura } from '@/lib/contabilidad/tipos'

export * from '@/lib/contabilidad/tipos'

interface CostoEmbed {
  precio_kg: number | null
  importe: number | null
  importe_pagado: number | null
  factura: string | null
}
interface EntradaRow {
  id: string
  folio: number
  fecha_acopio: string
  proveedor_nombre: string
  comunidad: string | null
  municipio: string | null
  especie: string
  tipo: string
  total_sacos: number
  kg_netos: number
  quintales: number | null
  entrada_costo: CostoEmbed | CostoEmbed[] | null
  entrada_pago: Pago[] | null
  entrada_factura: Factura[] | null
}

/** Boletas con su costo (embebido). Sólo tiene sentido para admin/contador. */
export async function getBoletasConCosto(): Promise<BoletaCosto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entradas')
    .select(
      'id, folio, fecha_acopio, proveedor_nombre, comunidad, municipio, especie, tipo,' +
        ' total_sacos, kg_netos, quintales,' +
        ' entrada_costo ( precio_kg, importe, importe_pagado, factura ),' +
        ' entrada_pago ( id, fecha, monto, metodo, referencia, observaciones ),' +
        ' entrada_factura ( id, folio, fecha, monto, uuid_fiscal )',
    )
    .order('folio', { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)

  return ((data ?? []) as unknown as EntradaRow[]).map((e) => {
    const c = Array.isArray(e.entrada_costo) ? e.entrada_costo[0] : e.entrada_costo
    const pagos = (e.entrada_pago ?? [])
      .map((p) => ({ ...p, monto: Number(p.monto) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
    const facturas = (e.entrada_factura ?? []).map((f) => ({
      ...f,
      monto: f.monto == null ? null : Number(f.monto),
    }))
    return {
      pagos,
      facturas,
      id: e.id,
      folio: e.folio,
      fecha_acopio: e.fecha_acopio,
      proveedor_nombre: e.proveedor_nombre,
      comunidad: e.comunidad,
      municipio: e.municipio,
      especie: e.especie,
      tipo: e.tipo,
      total_sacos: e.total_sacos,
      kg_netos: Number(e.kg_netos),
      quintales: e.quintales == null ? null : Number(e.quintales),
      precio_kg: c?.precio_kg == null ? null : Number(c.precio_kg),
      importe: c?.importe == null ? null : Number(c.importe),
      importe_pagado: c?.importe_pagado == null ? 0 : Number(c.importe_pagado),
      factura: c?.factura ?? null,
    }
  })
}

/**
 * Costo por corte de maquila: suma el importe de las boletas que alimentaron
 * cada corte (materia prima) y lo divide entre los kg de oro obtenidos. El
 * importe sale de entrada_costo, así que sólo tiene números para contador/admin;
 * para el resto, la RLS deja el importe en 0 (no ve costos).
 */
export async function getMaquilasCosto(): Promise<MaquilaCosto[]> {
  const supabase = await createClient()

  const [mq, mb, costos, res, prods] = await Promise.all([
    supabase.from('maquilas').select('id, numero, especie, fecha_corte').limit(2000),
    supabase.from('maquila_boleta').select('maquila_id, entrada_id').limit(20000),
    supabase.from('entrada_costo').select('entrada_id, importe').limit(20000),
    supabase.from('maquila_resultado').select('maquila_id, producto_id, total_kg').limit(20000),
    supabase.from('maquila_producto').select('id, clave').limit(200),
  ])
  for (const r of [mq, mb, costos, res, prods]) if (r.error) throw new Error(r.error.message)

  const importePorEntrada = new Map<string, number>()
  for (const c of costos.data ?? []) {
    if (c.importe != null) importePorEntrada.set(c.entrada_id as string, Number(c.importe))
  }
  const oroIds = new Set(
    (prods.data ?? []).filter((p) => p.clave === 'ORO_EXPORTACION').map((p) => p.id as string),
  )
  const oroKgPorMaquila = new Map<string, number>()
  for (const r of res.data ?? []) {
    if (!oroIds.has(r.producto_id as string)) continue
    const k = r.maquila_id as string
    oroKgPorMaquila.set(k, (oroKgPorMaquila.get(k) ?? 0) + Number(r.total_kg ?? 0))
  }

  const agg = new Map<string, { boletas: number; conPrecio: number; importe: number }>()
  for (const b of mb.data ?? []) {
    const k = b.maquila_id as string
    const a = agg.get(k) ?? { boletas: 0, conPrecio: 0, importe: 0 }
    a.boletas++
    const imp = importePorEntrada.get(b.entrada_id as string)
    if (imp != null) {
      a.conPrecio++
      a.importe += imp
    }
    agg.set(k, a)
  }

  const red = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d
  return ((mq.data ?? []) as unknown as { id: string; numero: number | null; especie: string | null; fecha_corte: string | null }[])
    .map((m) => {
      const a = agg.get(m.id) ?? { boletas: 0, conPrecio: 0, importe: 0 }
      const oroKg = oroKgPorMaquila.get(m.id) ?? 0
      return {
        id: m.id,
        numero: m.numero,
        especie: m.especie,
        fecha_corte: m.fecha_corte,
        boletas: a.boletas,
        boletas_con_precio: a.conPrecio,
        importe_total: red(a.importe),
        oro_kg: red(oroKg, 2),
        costo_kg_oro: oroKg > 0 && a.importe > 0 ? red(a.importe / oroKg, 4) : null,
      }
    })
    .sort((x, y) => (y.numero ?? 0) - (x.numero ?? 0))
}
