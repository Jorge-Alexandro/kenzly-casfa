// Concentrado de acopio — consultas server-side (el reporte de Francisco).
// El importe sale de entrada_costo, que la RLS reserva a admin/contador: para
// cualquier otro rol los importes salen en 0.
import { createClient } from '@/lib/supabase/server'
import {
  acumular, celdaVacia, enLotes, llevaQuintal, mesDe, nombreComercial, MESES,
  type CeldaAcopio, type FilaCooperativa, type QQAcopiados, type ReparteCooperativas,
} from '@/lib/acopio/concentrado'

export * from '@/lib/acopio/concentrado'

export interface FiltrosConcentrado {
  desde?: string | null
  hasta?: string | null
}

export interface BoletaConcentrado {
  folio: number
  fecha: string
  mes: string
  comunidad: string | null
  municipio: string | null
  proveedor: string
  tipo_persona: 'moral' | 'fisica'
  tipo_cafe: string
  sacos: number
  kg_brutos: number
  tara_kg: number
  kg_netos: number
  quintales: number | null
  precio_kg: number | null
  importe: number | null
  importe_pagado: number
  facturas: string | null
}

/** Nombre plegado para emparejar la boleta con el catálogo de proveedores. */
const clave = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export interface ProveedorTipo {
  id: string
  nombre: string
  tipo_persona: 'moral' | 'fisica'
  boletas: number
}

/**
 * Proveedores del acopio con su tipo (sociedad/individual) y cuántas boletas
 * tienen, para que Contabilidad los clasifique. El tipo decide cómo se agrupa el
 * acopio por cooperativa.
 */
export async function getProveedoresParaClasificar(): Promise<ProveedorTipo[]> {
  const supabase = await createClient()
  const [prov, ent] = await Promise.all([
    supabase.from('acopio_proveedor').select('id, nombre, tipo_persona').eq('activo', true).limit(5000),
    supabase.from('entradas').select('proveedor_nombre').limit(5000),
  ])
  if (prov.error) throw new Error(prov.error.message)
  if (ent.error) throw new Error(ent.error.message)

  const cuenta = new Map<string, number>()
  for (const e of ent.data ?? []) {
    const k = clave(e.proveedor_nombre as string)
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }

  return (prov.data ?? [])
    .map((p) => ({
      id: p.id as string,
      nombre: p.nombre as string,
      tipo_persona: (p.tipo_persona as 'moral' | 'fisica') ?? 'fisica',
      boletas: cuenta.get(clave(p.nombre as string)) ?? 0,
    }))
    .sort((a, b) => b.boletas - a.boletas || a.nombre.localeCompare(b.nombre, 'es'))
}

/** El detalle: una fila por boleta, como su hoja MATRIX. */
export async function getConcentrado(f: FiltrosConcentrado): Promise<BoletaConcentrado[]> {
  const supabase = await createClient()

  let q = supabase
    .from('entradas')
    .select(
      'id, folio, fecha_acopio, proveedor_nombre, comunidad, municipio, especie, tipo,' +
        ' total_sacos, kg_brutos, tara_kg, kg_netos, quintales,' +
        ' entrada_costo ( precio_kg, importe, importe_pagado ),' +
        ' entrada_factura ( folio )',
    )
    .order('fecha_acopio', { ascending: true })
    .order('folio', { ascending: true })
    .limit(5000)
  if (f.desde) q = q.gte('fecha_acopio', f.desde)
  if (f.hasta) q = q.lte('fecha_acopio', f.hasta)

  const [{ data, error }, { data: provs }] = await Promise.all([
    q,
    supabase.from('acopio_proveedor').select('nombre, tipo_persona').limit(5000),
  ])
  if (error) throw new Error(error.message)

  // El catálogo dice si el proveedor es sociedad; las boletas guardan el nombre
  // en texto, así que se empareja por nombre plegado.
  const tipoPorNombre = new Map<string, 'moral' | 'fisica'>()
  for (const p of provs ?? []) {
    tipoPorNombre.set(clave(p.nombre as string), (p.tipo_persona as 'moral' | 'fisica') ?? 'fisica')
  }

  interface Fila {
    folio: number
    fecha_acopio: string
    proveedor_nombre: string
    comunidad: string | null
    municipio: string | null
    especie: string
    tipo: string
    total_sacos: number
    kg_brutos: number
    tara_kg: number
    kg_netos: number
    quintales: number | null
    entrada_costo: { precio_kg: number | null; importe: number | null; importe_pagado: number | null }[] | { precio_kg: number | null; importe: number | null; importe_pagado: number | null } | null
    entrada_factura: { folio: string }[] | null
  }

  return ((data ?? []) as unknown as Fila[]).map((e) => {
    const c = Array.isArray(e.entrada_costo) ? e.entrada_costo[0] : e.entrada_costo
    const facturas = (e.entrada_factura ?? []).map((x) => x.folio).join(' · ') || null
    return {
      folio: e.folio,
      fecha: e.fecha_acopio,
      mes: mesDe(e.fecha_acopio),
      comunidad: e.comunidad,
      municipio: e.municipio,
      proveedor: e.proveedor_nombre,
      tipo_persona: tipoPorNombre.get(clave(e.proveedor_nombre)) ?? 'fisica',
      tipo_cafe: nombreComercial(e.especie, e.tipo),
      sacos: Number(e.total_sacos) || 0,
      kg_brutos: Number(e.kg_brutos) || 0,
      tara_kg: Number(e.tara_kg) || 0,
      kg_netos: Number(e.kg_netos) || 0,
      quintales: e.quintales == null ? null : Number(e.quintales),
      precio_kg: c?.precio_kg == null ? null : Number(c.precio_kg),
      importe: c?.importe == null ? null : Number(c.importe),
      importe_pagado: c?.importe_pagado == null ? 0 : Number(c.importe_pagado),
      facturas,
    }
  })
}

/** Pivote mes × tipo de café (kilos, quintales, importe). El cacao va aparte. */
export function armarQQAcopiados(boletas: BoletaConcentrado[]): QQAcopiados {
  const tipos = Array.from(
    new Set(boletas.filter((b) => b.tipo_cafe !== 'CACAO').map((b) => b.tipo_cafe)),
  ).sort()

  const porMes = new Map<string, Record<string, CeldaAcopio>>()
  const totalPorTipo: Record<string, CeldaAcopio> = {}
  const total = celdaVacia()
  const cacao = { kg: 0, boletas: 0, importe: 0 }

  for (const b of boletas) {
    const importe = b.importe ?? 0
    if (b.tipo_cafe === 'CACAO' || !llevaQuintal(b.tipo_cafe)) {
      cacao.kg = Math.round((cacao.kg + b.kg_netos) * 100) / 100
      cacao.importe = Math.round((cacao.importe + importe) * 100) / 100
      cacao.boletas++
      continue
    }
    const fila = porMes.get(b.mes) ?? {}
    fila[b.tipo_cafe] = fila[b.tipo_cafe] ?? celdaVacia()
    acumular(fila[b.tipo_cafe], b.kg_netos, b.quintales ?? 0, importe)
    porMes.set(b.mes, fila)

    totalPorTipo[b.tipo_cafe] = totalPorTipo[b.tipo_cafe] ?? celdaVacia()
    acumular(totalPorTipo[b.tipo_cafe], b.kg_netos, b.quintales ?? 0, importe)
    acumular(total, b.kg_netos, b.quintales ?? 0, importe)
  }

  const filas = Array.from(porMes.entries())
    .sort((a, b) => MESES.indexOf(a[0] as never) - MESES.indexOf(b[0] as never))
    .map(([mes, porTipo]) => {
      const t = celdaVacia()
      for (const c of Object.values(porTipo)) {
        t.kg = Math.round((t.kg + c.kg) * 100) / 100
        t.qq = Math.round((t.qq + c.qq) * 10000) / 10000
        t.importe = Math.round((t.importe + c.importe) * 100) / 100
        t.boletas += c.boletas
      }
      return { mes, porTipo, total: t }
    })

  return { tipos, filas, totalPorTipo, total, cacao }
}

/** QQ de café (y kg de cacao aparte) por cooperativa y el bloque de individuales. */
export function armarCooperativas(boletas: BoletaConcentrado[]): ReparteCooperativas {
  const nueva = (nombre: string, esSociedad: boolean): FilaCooperativa => ({
    nombre, esSociedad, boletas: 0, cafe_kg: 0, cafe_qq: 0, cacao_kg: 0, lotes: 0, importe: 0,
  })
  const porSociedad = new Map<string, FilaCooperativa>()
  const individuales = nueva('CASFA — socios individuales', false)

  const sumar = (f: FilaCooperativa, b: BoletaConcentrado) => {
    f.boletas++
    f.importe = Math.round((f.importe + (b.importe ?? 0)) * 100) / 100
    // El cacao no lleva quintal: va aparte en kilos, nunca como QQ.
    if (b.tipo_cafe === 'CACAO') {
      f.cacao_kg = Math.round((f.cacao_kg + b.kg_netos) * 100) / 100
    } else {
      f.cafe_kg = Math.round((f.cafe_kg + b.kg_netos) * 100) / 100
      f.cafe_qq = Math.round((f.cafe_qq + (b.quintales ?? 0)) * 10000) / 10000
      f.lotes = enLotes(f.cafe_qq)
    }
  }

  for (const b of boletas) {
    if (b.tipo_persona === 'moral') {
      const f = porSociedad.get(b.proveedor) ?? nueva(b.proveedor, true)
      sumar(f, b)
      porSociedad.set(b.proveedor, f)
    } else {
      sumar(individuales, b)
    }
  }

  const sociedades = Array.from(porSociedad.values()).sort((a, b) => b.cafe_qq - a.cafe_qq)
  const total = nueva('TOTAL ACOPIO', false)
  for (const f of [...sociedades, individuales]) {
    total.boletas += f.boletas
    total.cafe_kg = Math.round((total.cafe_kg + f.cafe_kg) * 100) / 100
    total.cafe_qq = Math.round((total.cafe_qq + f.cafe_qq) * 10000) / 10000
    total.cacao_kg = Math.round((total.cacao_kg + f.cacao_kg) * 100) / 100
    total.importe = Math.round((total.importe + f.importe) * 100) / 100
  }
  total.lotes = enLotes(total.cafe_qq)

  return { sociedades, individuales, total }
}
