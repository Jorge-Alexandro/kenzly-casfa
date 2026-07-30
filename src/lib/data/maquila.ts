// Módulo 6 — Maquila: consultas del lado servidor (Server Components).
// RLS acota por organización en cada query; nunca pasamos org_id del cliente.
import { createClient } from '@/lib/supabase/server'
import type { Aviso } from '@/lib/maquila/validacion.mjs'
import type { BoletaDisponible } from '@/lib/maquila/captura'
import { KG_POR_QUINTAL_ORO } from '@/lib/maquila/importar.mjs'

export interface MaquilaRow {
  id: string
  clave: string
  numero: number | null
  tipo_proceso: 'maquila' | 'repaso_oro' | 'repaso_clasificadora'
  fecha_corte: string
  especie: string
  tipo_entrada: string
  sacos_entrada: number
  kg_entrada: number
  kg_salida: number
  qq_salida: number
  rendimiento: number | null
  avisos: Aviso[]
  origen_archivo: string | null
}

/** Fila de la vista que sustituye la hoja 'MASTER MAQUILAS' del Excel. */
export interface MasterRow {
  clave: string
  numero: number | null
  tipo_proceso: string
  fecha_corte: string
  especie: string
  tipo_entrada: string
  sacos_entrada: number
  kg_entrada: number
  qq_entrada: number | null
  sacos_primeras: number
  qq_primeras: number
  rend_primeras: number | null
  sacos_segundas: number
  qq_segundas: number
  rend_segundas: number | null
  sacos_terceras: number
  qq_terceras: number
  rend_terceras: number | null
  sacos_salida: number
  qq_salida: number
  qq_diferencia: number
  rendimiento: number | null
  rend_proceso: number | null
}

export async function getMaquilas(): Promise<MaquilaRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maquilas')
    .select(
      'id, clave, numero, tipo_proceso, fecha_corte, especie, tipo_entrada,' +
        ' sacos_entrada, kg_entrada, kg_salida, qq_salida, rendimiento, avisos, origen_archivo',
    )
    .order('fecha_corte', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as MaquilaRow[]
}

/** El MASTER, derivado. Ya no se teclea: se consulta. */
export async function getMaster(): Promise<MasterRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_maquila_master')
    .select('*')
    .order('fecha_corte', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as MasterRow[]
}

export interface SalidaRow {
  id: string
  tipo_salida: 'exportacion' | 'nacional'
  fecha_salida: string
  /** Sólo exportación ('26/CAS-01'). */
  guia: string | null
  /** Sólo nacional; se repite entre filas, no es llave. */
  folio: number | null
  numero_lote: number | null
  destino: string | null
  sacos: number
  quintales: number | null
  lote_oic: string | null
  transporte: string | null
  canal: string | null
  placas: string | null
  producto_texto: string | null
  observacion: string | null
}

export async function getSalidas(): Promise<SalidaRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maquila_salida')
    .select(
      'id, tipo_salida, fecha_salida, guia, folio, numero_lote, destino, sacos, quintales,' +
        ' lote_oic, transporte, canal, placas, producto_texto, observacion',
    )
    .order('fecha_salida', { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as SalidaRow[]
}

// ----------------------------------------------------------------------------
// Captura nativa (Fase 1): lo que necesita el formulario "Nuevo corte".
// ----------------------------------------------------------------------------

/**
 * El saldo por boleta: total de la entrada MENOS lo que ya se usó en
 * cualquier corte de maquila (una entrega comercial grande puede repartirse
 * entre dos cortes en días distintos — la boleta 302 se repartió 127+100
 * sacos entre M-17 y M-18, no es un simple "ya usada / no usada").
 *
 * Compartida por getBoletasDisponibles (candidatas para un corte nuevo, una
 * fila por boleta) y getInventarioMateriaPrima (el mismo saldo, sumado por
 * especie/tipo — es el "café que aún no ha pasado por el beneficio").
 */
async function boletasConSaldo(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [{ data: usos, error: uErr }, { data: entradas, error: eErr }] = await Promise.all([
    supabase.from('maquila_boleta').select('entrada_id, sacos, kg_netos').not('entrada_id', 'is', null).limit(20000),
    supabase
      .from('entradas')
      .select('id, folio, fecha_acopio, especie, tipo, proveedor_nombre, total_sacos, kg_netos')
      .in('estado', ['completada', 'pdf_generado'])
      .order('fecha_acopio', { ascending: true })
      .limit(5000),
  ])
  if (uErr) throw new Error(uErr.message)
  if (eErr) throw new Error(eErr.message)

  const usadoPorEntrada = new Map<string, { sacos: number; kg: number }>()
  for (const u of usos ?? []) {
    const id = u.entrada_id as string
    const acc = usadoPorEntrada.get(id) ?? { sacos: 0, kg: 0 }
    acc.sacos += Number(u.sacos) || 0
    acc.kg += Number(u.kg_netos) || 0
    usadoPorEntrada.set(id, acc)
  }

  return (entradas ?? []).map((e) => {
    const usado = usadoPorEntrada.get(e.id as string) ?? { sacos: 0, kg: 0 }
    const sacosTot = Number(e.total_sacos)
    const kgTot = Number(e.kg_netos)
    return {
      id: e.id as string,
      folio: e.folio as number,
      fecha_acopio: e.fecha_acopio as string,
      especie: e.especie as string,
      tipo: e.tipo as string,
      proveedor_nombre: e.proveedor_nombre as string,
      sacos_totales: sacosTot,
      kg_totales: kgTot,
      sacos_disponibles: Math.max(0, Math.round((sacosTot - usado.sacos) * 100) / 100),
      kg_disponibles: Math.max(0, Math.round((kgTot - usado.kg) * 100) / 100),
    }
  })
}

/**
 * Boletas de acopio con SALDO disponible para un corte de maquila (`completada`
 * y `pdf_generado` son los únicos estados con pesada y calidad cerradas; el
 * resto —borrador, en_pesaje…— todavía se está capturando en bodega). Se
 * excluyen las que ya están en 0.
 */
export async function getBoletasDisponibles(): Promise<BoletaDisponible[]> {
  const supabase = await createClient()
  const filas = await boletasConSaldo(supabase)
  return filas.filter((b) => b.kg_disponibles > 0.5 && b.sacos_disponibles > 0)
}

export interface CatalogoProducto {
  id: string
  clave: string
  nombre: string
  grupo: 'primeras' | 'segundas' | 'terceras' | 'merma'
  kg_por_saco: number
  orden: number
}

export async function getCatalogoMaquila(): Promise<CatalogoProducto[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maquila_producto')
    .select('id, clave, nombre, grupo, kg_por_saco, orden')
    .eq('activo', true)
    .order('orden')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as CatalogoProducto[]
}

export interface SiguienteCorte {
  numero: number
  /** Sugerido del "sacos_no_enviados" del corte anterior; editable en el form. */
  arrastreSugerido: number
}

/** Próximo número de corte y el arrastre sugerido del corte más reciente. */
export async function getSiguienteCorte(): Promise<SiguienteCorte> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maquilas')
    .select('numero, sacos_no_enviados, fecha_corte')
    .not('numero', 'is', null)
    .order('fecha_corte', { ascending: false })
    .order('numero', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const ultimo = data?.[0]
  return {
    numero: (Number(ultimo?.numero) || 0) + 1,
    arrastreSugerido: Number(ultimo?.sacos_no_enviados ?? 0),
  }
}

export interface MaquilaDetalle {
  id: string
  clave: string
  numero: number | null
  tipo_proceso: string
  fecha_corte: string
  especie: string
  tipo_entrada: string
  descripcion: string | null
  sacos_entrada: number
  kg_entrada: number
  qq_entrada: number | null
  kg_salida: number
  qq_salida: number
  sacos_salida: number
  rendimiento: number | null
  sacos_enviados_lotes: number
  sacos_maquilas_previas: number
  sacos_torrefaccion: number
  sacos_no_enviados: number
  sacos_venta: number
  sacos_otro_lote: number
  sacos_repaso: number
  sacos_cuadre_total: number
  observaciones: string | null
  elaboro: string | null
  entrego: string | null
  retrillero: string | null
  calador: string | null
  firma_elaboro_url: string | null
  firma_entrego_url: string | null
  firma_retrillero_url: string | null
  firma_calador_url: string | null
  origen_archivo: string | null
  avisos: Aviso[]
  resultados: { clave: string; nombre: string; grupo: string; sacos: number; kilos_sueltos: number; kg_por_saco: number; total_kg: number; quintales: number; rend_real: number | null }[]
  boletas: { folio: number; proveedor_nombre: string; sacos: number; kg_netos: number; quintales: number | null }[]
  lotes: { numero_lote: number; sacos: number; kg: number; descripcion: string | null }[]
}

/** El detalle completo de un corte, para su PDF o su pantalla de detalle. */
export async function getMaquilaDetalle(id: string): Promise<MaquilaDetalle | null> {
  const supabase = await createClient()

  const { data: m, error: mErr } = await supabase.from('maquilas').select('*').eq('id', id).maybeSingle()
  if (mErr) throw new Error(mErr.message)
  if (!m) return null

  const [{ data: resultados, error: rErr }, { data: boletas, error: bErr }, { data: lotes, error: lErr }] =
    await Promise.all([
      supabase
        .from('maquila_resultado')
        .select('sacos, kilos_sueltos, kg_por_saco, total_kg, quintales, rend_real, maquila_producto ( clave, nombre, grupo, orden )')
        .eq('maquila_id', id),
      supabase.from('maquila_boleta').select('folio, proveedor_nombre, sacos, kg_netos, quintales').eq('maquila_id', id).order('folio'),
      supabase.from('maquila_lote').select('numero_lote, sacos, kg, descripcion').eq('maquila_id', id).order('numero_lote'),
    ])
  if (rErr) throw new Error(rErr.message)
  if (bErr) throw new Error(bErr.message)
  if (lErr) throw new Error(lErr.message)

  interface ResultadoRow {
    sacos: number; kilos_sueltos: number; kg_por_saco: number; total_kg: number; quintales: number; rend_real: number | null
    maquila_producto: { clave: string; nombre: string; grupo: string; orden: number } | { clave: string; nombre: string; grupo: string; orden: number }[] | null
  }

  const resultadosOrdenados = ((resultados ?? []) as unknown as ResultadoRow[])
    .map((r) => {
      const p = Array.isArray(r.maquila_producto) ? r.maquila_producto[0] : r.maquila_producto
      return {
        clave: p?.clave ?? '', nombre: p?.nombre ?? '', grupo: p?.grupo ?? '', orden: p?.orden ?? 0,
        sacos: Number(r.sacos), kilos_sueltos: Number(r.kilos_sueltos), kg_por_saco: Number(r.kg_por_saco),
        total_kg: Number(r.total_kg), quintales: Number(r.quintales),
        rend_real: r.rend_real == null ? null : Number(r.rend_real),
      }
    })
    .sort((a, b) => a.orden - b.orden)

  return {
    id: m.id, clave: m.clave, numero: m.numero, tipo_proceso: m.tipo_proceso, fecha_corte: m.fecha_corte,
    especie: m.especie, tipo_entrada: m.tipo_entrada, descripcion: m.descripcion,
    sacos_entrada: Number(m.sacos_entrada), kg_entrada: Number(m.kg_entrada),
    qq_entrada: m.qq_entrada == null ? null : Number(m.qq_entrada),
    kg_salida: Number(m.kg_salida), qq_salida: Number(m.qq_salida), sacos_salida: Number(m.sacos_salida),
    rendimiento: m.rendimiento == null ? null : Number(m.rendimiento),
    sacos_enviados_lotes: Number(m.sacos_enviados_lotes), sacos_maquilas_previas: Number(m.sacos_maquilas_previas),
    sacos_torrefaccion: Number(m.sacos_torrefaccion), sacos_no_enviados: Number(m.sacos_no_enviados),
    sacos_venta: Number(m.sacos_venta), sacos_otro_lote: Number(m.sacos_otro_lote),
    sacos_repaso: Number(m.sacos_repaso), sacos_cuadre_total: Number(m.sacos_cuadre_total),
    observaciones: m.observaciones, elaboro: m.elaboro, entrego: m.entrego, retrillero: m.retrillero, calador: m.calador,
    firma_elaboro_url: m.firma_elaboro_url, firma_entrego_url: m.firma_entrego_url,
    firma_retrillero_url: m.firma_retrillero_url, firma_calador_url: m.firma_calador_url,
    origen_archivo: m.origen_archivo, avisos: (m.avisos ?? []) as Aviso[],
    resultados: resultadosOrdenados,
    boletas: (boletas ?? []).map((b) => ({
      folio: b.folio, proveedor_nombre: b.proveedor_nombre, sacos: Number(b.sacos),
      kg_netos: Number(b.kg_netos), quintales: b.quintales == null ? null : Number(b.quintales),
    })),
    lotes: (lotes ?? []).map((l) => ({
      numero_lote: l.numero_lote, sacos: Number(l.sacos), kg: Number(l.kg), descripcion: l.descripcion,
    })),
  }
}

/** Último corte de inventario con sus renglones. */
export async function getInventarioUltimo() {
  const supabase = await createClient()
  const { data: corte, error } = await supabase
    .from('inventario_corte')
    .select('id, fecha')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!corte) return null

  const { data: lineas, error: lErr } = await supabase
    .from('inventario_linea')
    .select('especie, producto_texto, stock_sacos, stock_kg, quintales')
    .eq('corte_id', corte.id)
    .gt('stock_kg', 0)
  if (lErr) throw new Error(lErr.message)

  return { fecha: corte.fecha as string, lineas: lineas ?? [] }
}

// ----------------------------------------------------------------------------
// Inventario EN VIVO (Fase 2): ya no es una foto que alguien sube en Excel — se
// calcula solo, siempre al día, de las mismas tablas que ya alimenta el resto
// del módulo. El snapshot de Excel (arriba) se conserva como referencia
// histórica; esto es lo que hay en bodega AHORA MISMO.
//
//   Materia prima     = lo que ya se acopió y AÚN NO entra a un corte
//                        (mismo saldo que usa "Nuevo corte", sumado por
//                        especie/tipo).
//   Producto terminado = lo que salió del beneficio (maquila_resultado) MENOS
//                        lo que ya se vendió/embarcó (maquila_salida). Sólo se
//                        puede cuadrar a nivel de GRUPO (primeras/segundas/
//                        terceras): las salidas nacionales no distinguen si el
//                        segunda que se vendió era Oliver, Clasificadora o PL,
//                        sólo que era "SEGUNDA/ARABE". El detalle por producto
//                        se muestra aparte, informativo, sin su propio stock.
// ----------------------------------------------------------------------------

export interface MateriaPrimaLinea {
  especie: string
  tipo: string
  boletas_pendientes: number
  sacos_disponibles: number
  kg_disponibles: number
}

/** Café ya acopiado que todavía no entra a ningún corte, por especie/tipo. */
export async function getInventarioMateriaPrima(): Promise<MateriaPrimaLinea[]> {
  const supabase = await createClient()
  const filas = await boletasConSaldo(supabase)

  const porTipo = new Map<string, MateriaPrimaLinea>()
  for (const b of filas) {
    if (b.kg_disponibles <= 0.5) continue
    const k = `${b.especie}|${b.tipo}`
    const l = porTipo.get(k) ?? { especie: b.especie, tipo: b.tipo, boletas_pendientes: 0, sacos_disponibles: 0, kg_disponibles: 0 }
    l.boletas_pendientes++
    l.sacos_disponibles += b.sacos_disponibles
    l.kg_disponibles = Math.round((l.kg_disponibles + b.kg_disponibles) * 100) / 100
    porTipo.set(k, l)
  }
  return Array.from(porTipo.values()).sort((a, b) => b.kg_disponibles - a.kg_disponibles)
}

export interface ProductoTerminadoDetalle {
  clave: string
  nombre: string
  kg_producido: number
}

export interface GrupoTerminado {
  especie: string
  grupo: string
  kg_producido: number
  kg_salido: number
  /**
   * producido − salido. PUEDE SALIR NEGATIVO: no es "inventario en negativo",
   * es la señal de que hay ventas/embarques de un grupo del que este sistema
   * no tiene registrado suficiente producción — casi siempre porque faltan
   * cortes de maquila por cargar (hoy sólo están digitalizados M-13 a M-19;
   * la hoja SALIDA del Master cubre lotes 1-59, o sea toda la temporada desde
   * enero). NO se recorta a 0: esconder el negativo sería fingir que no
   * falta nada.
   */
  stock_kg: number
  stock_qq: number
  productos: ProductoTerminadoDetalle[]
}

/** Grupo (primeras/segundas/terceras) al que corresponde una fila de salidas,
 * a partir de cómo el importador de la hoja SALIDA guarda `especie`:
 * 'ARABE'/'ROBUSTA' (sin prefijo) = primeras; 'SEGUNDA/ARABE' = segundas;
 * 'TERCERA/ROBUSTA' = terceras. */
function grupoDeSalida(especie: string | null): { especieBase: string; grupo: string } | null {
  const t = (especie ?? '').toUpperCase().trim()
  if (t === 'ARABE' || t === 'ROBUSTA') return { especieBase: t, grupo: 'primeras' }
  const m = t.match(/^(SEGUNDA|TERCERA)\/(ARABE|ROBUSTA)$/)
  if (!m) return null
  return { especieBase: m[2], grupo: m[1] === 'SEGUNDA' ? 'segundas' : 'terceras' }
}

/** Lo que salió del beneficio menos lo ya vendido/embarcado, por especie y grupo. */
export async function getInventarioProductoTerminado(): Promise<GrupoTerminado[]> {
  const supabase = await createClient()

  const [{ data: resultados, error: rErr }, { data: salidas, error: sErr }] = await Promise.all([
    supabase
      .from('maquila_resultado')
      .select('total_kg, maquilas ( especie ), maquila_producto ( clave, nombre, grupo, orden )')
      .limit(20000),
    supabase.from('maquila_salida').select('especie, quintales').limit(20000),
  ])
  if (rErr) throw new Error(rErr.message)
  if (sErr) throw new Error(sErr.message)

  interface ResultadoRow {
    total_kg: number
    maquilas: { especie: string } | { especie: string }[] | null
    maquila_producto: { clave: string; nombre: string; grupo: string; orden: number } | { clave: string; nombre: string; grupo: string; orden: number }[] | null
  }

  const grupos = new Map<string, GrupoTerminado>()
  const productos = new Map<string, Map<string, ProductoTerminadoDetalle>>() // "especie|grupo" -> clave -> detalle
  const grupo = (key: string, especie: string, nombreGrupo: string) =>
    grupos.get(key) ?? (() => {
      const g: GrupoTerminado = { especie, grupo: nombreGrupo, kg_producido: 0, kg_salido: 0, stock_kg: 0, stock_qq: 0, productos: [] }
      grupos.set(key, g)
      return g
    })()

  for (const r of (resultados ?? []) as unknown as ResultadoRow[]) {
    const mq = Array.isArray(r.maquilas) ? r.maquilas[0] : r.maquilas
    const pr = Array.isArray(r.maquila_producto) ? r.maquila_producto[0] : r.maquila_producto
    if (!mq || !pr || pr.grupo === 'merma') continue // la merma no es inventario vendible
    const especie = mq.especie
    const key = `${especie}|${pr.grupo}`
    const g = grupo(key, especie, pr.grupo)
    g.kg_producido = Math.round((g.kg_producido + Number(r.total_kg)) * 100) / 100

    const porProducto = productos.get(key) ?? new Map<string, ProductoTerminadoDetalle>()
    const d = porProducto.get(pr.clave) ?? { clave: pr.clave, nombre: pr.nombre, kg_producido: 0 }
    d.kg_producido = Math.round((d.kg_producido + Number(r.total_kg)) * 100) / 100
    porProducto.set(pr.clave, d)
    productos.set(key, porProducto)
  }

  // Toda salida clasificable SUMA a kg_salido, exista o no un grupo con
  // producción ya registrada — si no existe, se crea en 0: es justo el caso
  // que delata con más claridad un corte que falta por cargar (kg_salido > 0
  // con kg_producido = 0 no se puede confundir con "no hay nada que ver aquí").
  for (const s of salidas ?? []) {
    const info = grupoDeSalida(s.especie as string | null)
    if (!info) continue // fila que no se pudo clasificar (especie libre/atípica): no se descuenta a ciegas
    const key = `${info.especieBase}|${info.grupo}`
    const g = grupo(key, info.especieBase, info.grupo)
    const kg = Number(s.quintales ?? 0) * KG_POR_QUINTAL_ORO
    g.kg_salido = Math.round((g.kg_salido + kg) * 100) / 100
  }

  return Array.from(grupos.entries())
    .map(([key, g]) => {
      // SIN recortar a 0: un negativo es la señal de que faltan cortes por
      // cargar, no "inventario en negativo". Esconderlo con Math.max(0, …)
      // sería mostrar limpio lo que en realidad es un hueco de datos.
      g.stock_kg = Math.round((g.kg_producido - g.kg_salido) * 100) / 100
      g.stock_qq = Math.round((g.stock_kg / KG_POR_QUINTAL_ORO) * 10000) / 10000
      g.productos = Array.from(productos.get(key)?.values() ?? []).sort((a, b) => b.kg_producido - a.kg_producido)
      return g
    })
    .sort((a, b) => a.especie.localeCompare(b.especie) || GRUPO_ORDEN[a.grupo] - GRUPO_ORDEN[b.grupo])
}

const GRUPO_ORDEN: Record<string, number> = { primeras: 0, segundas: 1, terceras: 2, merma: 3 }
