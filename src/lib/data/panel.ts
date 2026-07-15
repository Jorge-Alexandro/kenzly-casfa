// Agregación server-side del Panel de coordinación.
// Reúne los KPIs de TODAS las áreas en una sola pasada: catálogos, GeoSIC,
// fichas, expediente, certificación SIC, acopio, estimación, agroecología y
// alertas de certificados.
import { createClient } from '@/lib/supabase/server'
import { getParcelasGeo } from '@/lib/data/geosic'
import { calcularStats } from '@/lib/types'
import type { EstadoFicha } from '@/lib/types'
import { nivelAlerta, type NivelAlerta } from '@/lib/certificados/tipos'
import { NIVEL_ORDEN, type NivelCertificacion } from '@/lib/certificacion/tipos'

export interface PanelStats {
  // catálogos
  productores: number
  parcelas: number
  hectareas: number
  // geo
  con_poligono: number
  validadas: number
  diferencia_critica: number
  sin_poligono: number
  // fichas por estado
  fichas_total: number
  fichas_por_estado: Record<EstadoFicha, number>
  // expediente
  bitacoras: number
  historiales: number
  // certificación SIC
  cert_anio: number | null
  cert_niveles: Record<NivelCertificacion, number>
  bajas: number
  // acopio
  entradas: number
  pesadas: number
  acopio_sacos: number
  acopio_kg_netos: number
  acopio_quintales: number
  // estimación de cosecha
  estimaciones: number
  estimacion_kg: number
  // agroecología
  agro_programas: number
  agro_comunidades: number
  agro_socios: number
  agro_talleres: number
  agro_asistencias: number
  agro_pct_asistencia: number
  agro_plantas: number
  agro_abono: number
  // certificados (alertas)
  certificados: Record<NivelAlerta, number>
}

const ESTADOS: EstadoFicha[] = [
  'borrador', 'en_revision', 'aprobada', 'pdf_generado', 'requiere_correccion',
]

const num = (v: unknown) => Number(v) || 0

export async function getPanelStats(): Promise<PanelStats> {
  const supabase = await createClient()

  // Parcelas + geo (reutiliza el RPC del mapa) y la suma de hectáreas.
  const parcelasGeo = await getParcelasGeo()
  const geo = calcularStats(parcelasGeo)
  const hectareas = parcelasGeo.reduce((s, p) => s + num(p.superficie_declarada_ha), 0)

  const [
    productores, fichasEstados, bitacoras, historiales,
    cert, bajas, entradas, pesadas, estimaciones,
    programas, comunidades, avances, certificados,
  ] = await Promise.all([
    supabase.from('productores').select('id', { count: 'exact', head: true }),
    supabase.from('fichas').select('estado'),
    supabase.from('bitacora_anual').select('id', { count: 'exact', head: true }),
    supabase.from('historial_manejo_anual').select('id', { count: 'exact', head: true }),
    supabase.from('certificacion_estatus').select('anio, nivel'),
    supabase.from('productor_baja').select('id', { count: 'exact', head: true }),
    supabase.from('entradas').select('total_sacos, kg_netos, quintales'),
    supabase.from('pesadas').select('id', { count: 'exact', head: true }),
    supabase.from('estimacion_cosecha').select('kg_estimado, valor_final_kg'),
    supabase.from('agro_programa').select('id', { count: 'exact', head: true }),
    supabase.from('agro_comunidad').select('socios, plantas_entregadas, abono_ton'),
    supabase.from('agro_avance').select('impartido, f, m, avance'),
    supabase.from('certificado').select('fecha_vencimiento'),
  ])

  // --- Fichas por estado ---
  const fichas_por_estado = Object.fromEntries(ESTADOS.map((e) => [e, 0])) as Record<EstadoFicha, number>
  for (const f of fichasEstados.data ?? []) {
    const e = f.estado as EstadoFicha
    if (e in fichas_por_estado) fichas_por_estado[e]++
  }

  // --- Certificación: distribución del año MÁS RECIENTE con datos ---
  const cert_niveles = Object.fromEntries(NIVEL_ORDEN.map((n) => [n, 0])) as Record<NivelCertificacion, number>
  const anios = (cert.data ?? []).map((r) => r.anio as number)
  const cert_anio = anios.length ? Math.max(...anios) : null
  if (cert_anio != null) {
    for (const r of cert.data ?? []) {
      if (r.anio === cert_anio) {
        const n = r.nivel as NivelCertificacion
        if (n in cert_niveles) cert_niveles[n]++
      }
    }
  }

  // --- Acopio ---
  const ents = entradas.data ?? []
  const acopio_sacos = ents.reduce((s, e) => s + num(e.total_sacos), 0)
  const acopio_kg_netos = ents.reduce((s, e) => s + num(e.kg_netos), 0)
  const acopio_quintales = ents.reduce((s, e) => s + num(e.quintales), 0)

  // --- Estimación (usa el valor final si existe, si no el calculado) ---
  const estimacion_kg = (estimaciones.data ?? []).reduce(
    (s, e) => s + num(e.valor_final_kg ?? e.kg_estimado), 0,
  )

  // --- Agroecología ---
  const coms = comunidades.data ?? []
  const avs = avances.data ?? []
  const impartidos = avs.filter((a) => a.impartido)
  const agro_pct_asistencia = impartidos.length
    ? impartidos.reduce((s, a) => s + num(a.avance), 0) / impartidos.length
    : 0

  // --- Certificados (alertas) ---
  const certAlertas = { vencido: 0, critico: 0, proximo: 0, vigente: 0, sin_fecha: 0 } as Record<NivelAlerta, number>
  for (const c of certificados.data ?? []) {
    certAlertas[nivelAlerta(c.fecha_vencimiento as string | null)]++
  }

  return {
    productores: productores.count ?? 0,
    parcelas: geo.total,
    hectareas,
    con_poligono: geo.con_poligono,
    validadas: geo.validadas,
    diferencia_critica: geo.diferencia_critica,
    sin_poligono: geo.sin_poligono,
    fichas_total: (fichasEstados.data ?? []).length,
    fichas_por_estado,
    bitacoras: bitacoras.count ?? 0,
    historiales: historiales.count ?? 0,

    cert_anio,
    cert_niveles,
    bajas: bajas.count ?? 0,

    entradas: ents.length,
    pesadas: pesadas.count ?? 0,
    acopio_sacos,
    acopio_kg_netos: Math.round(acopio_kg_netos * 100) / 100,
    acopio_quintales: Math.round(acopio_quintales * 100) / 100,

    estimaciones: (estimaciones.data ?? []).length,
    estimacion_kg: Math.round(estimacion_kg * 100) / 100,

    agro_programas: programas.count ?? 0,
    agro_comunidades: coms.length,
    agro_socios: coms.reduce((s, c) => s + num(c.socios), 0),
    agro_talleres: impartidos.length,
    agro_asistencias: avs.reduce((s, a) => s + num(a.f) + num(a.m), 0),
    agro_pct_asistencia: Math.round(agro_pct_asistencia * 1000) / 1000,
    agro_plantas: coms.reduce((s, c) => s + num(c.plantas_entregadas), 0),
    agro_abono: Math.round(coms.reduce((s, c) => s + num(c.abono_ton), 0) * 1000) / 1000,

    certificados: certAlertas,
  }
}
