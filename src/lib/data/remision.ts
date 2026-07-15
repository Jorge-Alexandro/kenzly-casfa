// Módulo 7 — Remisión de campo: consultas del lado servidor.
// RLS acota por organización; nunca pasamos org_id del cliente.
import { createClient } from '@/lib/supabase/server'

export interface RemisionCuadre {
  remision_id: string
  folio: number
  fecha_remision: string
  ciclo: string
  proveedor_nombre: string
  comunidad: string | null
  especie: string
  tipo: string
  estado: 'en_campo' | 'recibida' | 'cancelada'
  sacos_declarados: number
  sacos_etiquetados: number
  sacos_recibidos: number
  sacos_faltantes: number
  kg_declarado: number | null
  boleta_folio: number | null
  kg_pesados: number | null
  /** Positivo = llegó menos de lo que el productor declaró. */
  kg_diferencia: number | null
}

export async function getRemisiones(): Promise<RemisionCuadre[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_remision_cuadre')
    .select('*')
    .order('fecha_remision', { ascending: false })
    .limit(300)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as RemisionCuadre[]
}

export interface SacoRemision {
  id: string
  orden: number
  codigo: string
  recibido_at: string | null
}

// supabase-js no infiere un select armado por concatenación (lo trata como
// GenericStringError), así que la forma se declara aquí.
export interface RemisionDetalle {
  id: string
  folio: number
  fecha_remision: string
  ciclo: string
  proveedor_nombre: string
  comunidad: string | null
  municipio: string | null
  especie: string
  tipo: string
  material_saco: string | null
  total_sacos: number
  kg_declarado: number | null
  observaciones: string | null
  estado: 'en_campo' | 'recibida' | 'cancelada'
  entrada_id: string | null
  lat: number | null
  lng: number | null
  sacos: SacoRemision[]
}

export async function getRemision(id: string): Promise<RemisionDetalle | null> {
  const supabase = await createClient()
  const { data: r, error } = await supabase
    .from('remisiones')
    .select(
      'id, folio, fecha_remision, ciclo, proveedor_nombre, comunidad, municipio, especie, tipo,' +
        ' material_saco, total_sacos, kg_declarado, observaciones, estado, entrada_id, lat, lng',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!r) return null

  const { data: sacos, error: sErr } = await supabase
    .from('remision_saco')
    .select('id, orden, recibido_at, etiqueta ( codigo )')
    .eq('remision_id', id)
    .order('orden', { ascending: true })
  if (sErr) throw new Error(sErr.message)

  return {
    ...(r as unknown as Omit<RemisionDetalle, 'sacos'>),
    sacos: (sacos ?? []).map((s) => ({
      id: s.id as string,
      orden: s.orden as number,
      recibido_at: s.recibido_at as string | null,
      codigo: (s.etiqueta as unknown as { codigo: string } | null)?.codigo ?? '',
    })),
  }
}

/**
 * Lo entregado por productor en el ciclo contra su estimación de cosecha.
 *
 * No es un reporte logístico: es control de integridad orgánica. La señal roja
 * clásica de NOP/UE es un productor que entrega bastante más de lo que su
 * superficie puede rendir — es la vía por la que se lava café convencional como
 * orgánico. Que el sistema lo vea solo es justo lo que un auditor quiere
 * encontrar.
 */
export async function getEntregasVsEstimacion(ciclo: string) {
  const supabase = await createClient()

  const { data: est, error: eErr } = await supabase
    .from('estimacion_cosecha')
    .select('productor_id, kg_estimado')
    .eq('ciclo', ciclo)
    .not('productor_id', 'is', null)
  if (eErr) throw new Error(eErr.message)

  // Un productor puede tener varias parcelas: su estimación es la suma.
  const estimado = new Map<string, number>()
  for (const e of est ?? []) {
    const id = e.productor_id as string
    estimado.set(id, (estimado.get(id) ?? 0) + Number(e.kg_estimado ?? 0))
  }

  const { data: entradas, error: enErr } = await supabase
    .from('entradas')
    .select('productor_id, proveedor_nombre, kg_netos')
    .eq('cosecha', ciclo)
    .not('productor_id', 'is', null)
  if (enErr) throw new Error(enErr.message)

  const entregado = new Map<string, { nombre: string; kg: number }>()
  for (const e of entradas ?? []) {
    const id = e.productor_id as string
    const prev = entregado.get(id)
    entregado.set(id, {
      nombre: (e.proveedor_nombre as string) ?? prev?.nombre ?? '',
      kg: (prev?.kg ?? 0) + Number(e.kg_netos ?? 0),
    })
  }

  const filas = []
  for (const [id, { nombre, kg }] of Array.from(entregado)) {
    const est_kg = estimado.get(id) ?? null
    filas.push({
      productor_id: id,
      nombre,
      kg_entregado: kg,
      kg_estimado: est_kg,
      // >1 = entregó más de lo estimado. Arriba de ~1.2 hay que preguntar.
      razon: est_kg && est_kg > 0 ? kg / est_kg : null,
    })
  }
  return filas.sort((a, b) => (b.razon ?? 0) - (a.razon ?? 0))
}
