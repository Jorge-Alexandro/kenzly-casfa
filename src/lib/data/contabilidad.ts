// Contabilidad — consultas server-side. El costo vive en entrada_costo, cuya
// RLS sólo deja entrar a admin/contador: el operativo no ve estas filas.
import { createClient } from '@/lib/supabase/server'
import type { BoletaCosto } from '@/lib/contabilidad/tipos'

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
}

/** Boletas con su costo (embebido). Sólo tiene sentido para admin/contador. */
export async function getBoletasConCosto(): Promise<BoletaCosto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('entradas')
    .select(
      'id, folio, fecha_acopio, proveedor_nombre, comunidad, municipio, especie, tipo,' +
        ' total_sacos, kg_netos, quintales,' +
        ' entrada_costo ( precio_kg, importe, importe_pagado, factura )',
    )
    .order('folio', { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)

  return ((data ?? []) as unknown as EntradaRow[]).map((e) => {
    const c = Array.isArray(e.entrada_costo) ? e.entrada_costo[0] : e.entrada_costo
    return {
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
