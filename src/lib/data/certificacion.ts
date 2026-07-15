// SIC — Certificación: consultas del lado servidor. RLS acota por organización.
import { createClient } from '@/lib/supabase/server'
import type {
  ProductorCert,
  NivelCertificacion,
  TipoBaja,
} from '@/lib/certificacion/tipos'

export * from '@/lib/certificacion/tipos'

export interface CertificacionData {
  anios: number[]
  productores: ProductorCert[]
}

/**
 * Padrón con su nivel de certificación por año (pivote) y su baja si aplica.
 * `anios` = años con datos ∪ los 4 años recientes, desc.
 */
export async function getCertificacion(): Promise<CertificacionData> {
  const supabase = await createClient()

  const [{ data: prods, error: pErr }, { data: est, error: eErr }, { data: bajas, error: bErr }] =
    await Promise.all([
      supabase
        .from('productores')
        .select('id, codigo, nombre_completo, comunidad, municipio')
        .order('codigo', { ascending: true })
        .limit(5000),
      supabase.from('certificacion_estatus').select('productor_id, anio, nivel, origen'),
      supabase.from('productor_baja').select('productor_id, tipo, fecha, motivo'),
    ])
  if (pErr) throw new Error(pErr.message)
  if (eErr) throw new Error(eErr.message)
  if (bErr) throw new Error(bErr.message)

  const bajaByProd = new Map<string, { tipo: TipoBaja; fecha: string; motivo: string | null }>()
  for (const b of bajas ?? []) {
    bajaByProd.set(b.productor_id as string, {
      tipo: b.tipo as TipoBaja,
      fecha: b.fecha as string,
      motivo: (b.motivo as string) ?? null,
    })
  }

  const estByProd = new Map<string, Record<number, { nivel: NivelCertificacion; origen: string }>>()
  const aniosSet = new Set<number>()
  for (const r of est ?? []) {
    const pid = r.productor_id as string
    const anio = r.anio as number
    aniosSet.add(anio)
    if (!estByProd.has(pid)) estByProd.set(pid, {})
    estByProd.get(pid)![anio] = { nivel: r.nivel as NivelCertificacion, origen: r.origen as string }
  }

  // Años a mostrar: los que tienen datos + los 4 recientes.
  const now = new Date().getFullYear()
  for (let y = now - 3; y <= now; y++) aniosSet.add(y)
  const anios = Array.from(aniosSet).sort((a, b) => b - a).slice(0, 6)

  const productores: ProductorCert[] = (prods ?? []).map((p) => ({
    id: p.id as string,
    codigo: p.codigo as string,
    nombre_completo: p.nombre_completo as string,
    comunidad: (p.comunidad as string) ?? null,
    municipio: (p.municipio as string) ?? null,
    estatus: estByProd.get(p.id as string) ?? {},
    baja: bajaByProd.get(p.id as string) ?? null,
  }))

  return { anios, productores }
}
