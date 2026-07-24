// Módulo 9 — Salidas: consultas server-side.
// La salida física la ve cualquier miembro; el PRECIO DE VENTA vive en
// salida_venta, cuya RLS sólo deja entrar a admin/contador.
import { createClient } from '@/lib/supabase/server'
import type { SalidaRow, SalidaConVenta, SalidaVenta } from '@/lib/salidas/tipos'

export * from '@/lib/salidas/tipos'

const COLS =
  'id, folio, fecha, guia, cliente, destino, especie, tipo, producto_texto,' +
  ' sacos, kg, quintales, responsable, transporte, placas, observaciones, estado'

export async function getSalidas(): Promise<SalidaRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('salida')
    .select(COLS)
    .order('folio', { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as SalidaRow[]
}

/**
 * Salidas con su precio de venta embebido. Para el operativo la RLS devuelve
 * `venta` en null: no ve el dinero. Para Contabilidad trae precio e importe.
 */
export async function getSalidasConVenta(): Promise<SalidaConVenta[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('salida')
    .select(
      COLS + ', salida_venta ( precio_kg, importe, moneda, importe_cobrado, factura )',
    )
    .order('folio', { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)

  type Fila = SalidaRow & { salida_venta: SalidaVenta | SalidaVenta[] | null }
  return ((data ?? []) as unknown as Fila[]).map((s) => {
    const v = Array.isArray(s.salida_venta) ? s.salida_venta[0] : s.salida_venta
    const { salida_venta: _omit, ...resto } = s
    return {
      ...resto,
      sacos: Number(s.sacos),
      kg: Number(s.kg),
      quintales: s.quintales == null ? null : Number(s.quintales),
      venta: v
        ? {
            precio_kg: v.precio_kg == null ? null : Number(v.precio_kg),
            importe: v.importe == null ? null : Number(v.importe),
            moneda: v.moneda ?? 'MXN',
            importe_cobrado: v.importe_cobrado == null ? 0 : Number(v.importe_cobrado),
            factura: v.factura ?? null,
          }
        : null,
    }
  })
}
