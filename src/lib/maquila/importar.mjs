// ============================================================================
// Ingesta de un formato de acopio (.xlsx) a la base.
// ----------------------------------------------------------------------------
// UNA sola autoridad, usada por los dos caminos que existen:
//   - /api/maquila/importar  → cliente Supabase con sesión (RLS)
//   - scripts/import-maquila.mjs → cliente admin (service role), carga inicial
// Si esto viviera duplicado en el script, las dos copias se separarían a la
// primera corrección y nadie sabría cuál manda.
//
// Recibe el cliente ya construido: aquí no se decide quién eres, sólo qué se
// escribe. El org_id llega explícito (con RLS es redundante pero inofensivo;
// con service role es imprescindible).
//
// Idempotente: upsert por (org_id, clave) para cortes y por (org_id, fecha)
// para inventarios. Reenviar el mismo archivo no duplica; reenviar una versión
// corregida reemplaza los renglones.
// ============================================================================
import { parsearMaquila, parsearInventario, parsearSalidas } from './formato.mjs'
import { validarMaquila, validarInventario, validarSalidas } from './validacion.mjs'

/** Quintal de café oro: 100 lb. Es el que usa el MASTER en todas sus columnas. */
export const KG_POR_QUINTAL_ORO = 45.35

/** El inventario trae la hoja MATERIA PRIMA; el corte de maquila, no. */
export function esInventario(nombreArchivo, bytes) {
  if (/INVENTARIO/i.test(nombreArchivo)) return true
  try {
    parsearInventario(bytes)
    return true
  } catch {
    return false
  }
}

/** El MASTER es el único que trae hoja SALIDA (la programación de entregas). */
export function tieneSalidas(bytes) {
  try {
    parsearSalidas(bytes)
    return true
  } catch {
    return false
  }
}

/**
 * Enruta al importador que toca. Lanza Error con mensaje legible si algo falla.
 *
 * Del MASTER se toma SÓLO la hoja SALIDA. Sus hojas 'MAQUILA 1..19' son copias
 * a mano de los formatos individuales — la fuente de verdad son los formatos, y
 * volver a leerlas aquí sería importar el error de transcripción junto con el
 * dato.
 */
export async function importarArchivo(supabase, orgId, bytes, nombreArchivo, hash) {
  if (esInventario(nombreArchivo, bytes)) {
    return importarInventario(supabase, orgId, bytes, nombreArchivo, hash)
  }
  if (tieneSalidas(bytes)) {
    return importarSalidas(supabase, orgId, bytes, nombreArchivo)
  }
  return importarMaquila(supabase, orgId, bytes, nombreArchivo, hash)
}

// ----------------------------------------------------------------------------
// Corte de maquila
// ----------------------------------------------------------------------------
export async function importarMaquila(supabase, orgId, bytes, nombreArchivo, hash) {
  const corte = parsearMaquila(bytes, nombreArchivo)
  const avisos = validarMaquila(corte)

  if (!corte.fechaCorte) {
    throw new Error('El formato no trae fecha de corte; no se puede ubicar en el tiempo.')
  }

  // El factor de quintal sale del MISMO catálogo que usa el acopio: no se
  // vuelve a codificar aquí (57.5 pergamino / 45.35 oro / 80 cerezo).
  const { data: producto } = await supabase
    .from('acopio_producto')
    .select('factor_quintal')
    .eq('org_id', orgId)
    .eq('especie', corte.especie)
    .eq('tipo', corte.tipoEntrada)
    .maybeSingle()
  const factor = producto?.factor_quintal ? Number(producto.factor_quintal) : null

  const { data: catalogo, error: catErr } = await supabase
    .from('maquila_producto')
    .select('id, clave')
    .eq('org_id', orgId)
  if (catErr) throw new Error(catErr.message)
  const idPorClave = new Map((catalogo ?? []).map((p) => [p.clave, p.id]))

  const desconocidos = corte.resultados.filter((r) => !idPorClave.has(r.clave))
  if (desconocidos.length > 0) {
    throw new Error(
      `Productos que no están en el catálogo: ${desconocidos.map((d) => d.etiqueta).join(', ')}. ` +
        `Agrégalos a maquila_producto (o añade el alias) y vuelve a importar.`,
    )
  }

  const { data: maquila, error: mErr } = await supabase
    .from('maquilas')
    .upsert(
      {
        org_id: orgId,
        clave: corte.clave,
        numero: corte.numero,
        tipo_proceso: corte.tipoProceso,
        fecha_corte: corte.fechaCorte,
        especie: corte.especie,
        tipo_entrada: corte.tipoEntrada,
        descripcion: corte.descripcion,
        sacos_entrada: corte.sacosEntrada,
        kg_entrada: corte.kgEntrada,
        factor_quintal: factor,
        qq_entrada: factor ? corte.kgEntrada / factor : null,
        estimado_sacos: corte.estimadoSacos,
        sacos_enviados_lotes: corte.sacosEnviadosLotes,
        sacos_maquilas_previas: corte.sacosMaquilasPrevias,
        sacos_torrefaccion: corte.sacosTorrefaccion,
        sacos_no_enviados: corte.sacosNoEnviados,
        sacos_venta: corte.sacosVenta,
        sacos_otro_lote: corte.sacosOtroLote,
        sacos_repaso: corte.sacosRepaso,
        sacos_cuadre_total: corte.sacosCuadreTotal,
        observaciones: corte.observaciones,
        elaboro: corte.elaboro,
        entrego: corte.entrego,
        retrillero: corte.retrillero,
        calador: corte.calador,
        origen_archivo: nombreArchivo,
        origen_hash: hash,
        avisos,
      },
      { onConflict: 'org_id,clave' },
    )
    .select('id')
    .single()
  if (mErr) throw new Error(mErr.message)
  const maquilaId = maquila.id

  // Renglones: se borran y se reinsertan. Un corte reenviado puede tener MENOS
  // renglones que el anterior (le quitaron un producto), y un upsert dejaría
  // vivo el sobrante.
  await supabase.from('maquila_resultado').delete().eq('maquila_id', maquilaId)
  await supabase.from('maquila_boleta').delete().eq('maquila_id', maquilaId)
  await supabase.from('maquila_lote').delete().eq('maquila_id', maquilaId)

  if (corte.resultados.length > 0) {
    const { error } = await supabase.from('maquila_resultado').insert(
      corte.resultados.map((r) => ({
        org_id: orgId,
        maquila_id: maquilaId,
        producto_id: idPorClave.get(r.clave),
        sacos: r.sacos,
        kilos_sueltos: r.kilosSueltos,
        kg_por_saco: r.kgPorSaco,
        total_kg: r.totalKg,
        // Todo lo que SALE del beneficio es café oro, entre en pergamino o en
        // cerezo: por eso el quintal de salida es siempre el de oro (45.35 kg =
        // 100 lb), no el factor de la materia prima que entró.
        quintales: r.totalKg / KG_POR_QUINTAL_ORO,
        // % de este producto sobre el oro total del corte (la columna 'REND
        // REAL' del formato). Lo escribe la app, NO un trigger: si el trigger
        // de maquila_resultado actualizara maquila_resultado se llamaría a sí
        // mismo (ver 0024_maquila_fix_recursion.sql).
        rend_real: corte.kgSalida > 0 ? r.totalKg / corte.kgSalida : null,
      })),
    )
    if (error) throw new Error(error.message)
  }

  // Boletas: se enlazan con el acopio por folio. Las que no existan en
  // `entradas` quedan con entrada_id null (son históricas, previas al módulo).
  let boletasEnlazadas = 0
  if (corte.boletas.length > 0) {
    const { data: entradas } = await supabase
      .from('entradas')
      .select('id, folio')
      .eq('org_id', orgId)
      .in('folio', corte.boletas.map((b) => b.folio))
    const idPorFolio = new Map((entradas ?? []).map((e) => [e.folio, e.id]))
    boletasEnlazadas = idPorFolio.size

    const { error } = await supabase.from('maquila_boleta').insert(
      corte.boletas.map((b) => ({
        org_id: orgId,
        maquila_id: maquilaId,
        folio: b.folio,
        entrada_id: idPorFolio.get(b.folio) ?? null,
        proveedor_nombre: b.proveedorNombre,
        tipo_cafe: b.tipoCafe,
        sacos: b.sacos,
        kg_brutos: b.kgBrutos,
        tara_kg: b.taraKg,
        kg_netos: b.kgNetos,
        quintales: b.quintales,
      })),
    )
    if (error) throw new Error(error.message)
  }

  if (corte.lotes.length > 0) {
    const { error } = await supabase.from('maquila_lote').upsert(
      corte.lotes.map((l) => ({
        org_id: orgId,
        maquila_id: maquilaId,
        numero_lote: l.numeroLote,
        sacos: l.sacos,
        kg: l.kg,
        descripcion: l.descripcion,
      })),
      { onConflict: 'org_id,numero_lote' },
    )
    if (error) throw new Error(error.message)
  }

  return {
    tipo: 'maquila',
    clave: corte.clave,
    fechaCorte: corte.fechaCorte,
    resultados: corte.resultados.length,
    boletas: corte.boletas.length,
    boletasEnlazadas,
    lotes: corte.lotes.length,
    avisos,
  }
}

// ----------------------------------------------------------------------------
// Corte de inventario
// ----------------------------------------------------------------------------
export async function importarInventario(supabase, orgId, bytes, nombreArchivo, hash) {
  const inv = parsearInventario(bytes, nombreArchivo)
  const avisos = validarInventario(inv)

  if (!inv.fecha) throw new Error('El inventario no trae fecha; no se puede ubicar en el tiempo.')

  const { data: catalogo } = await supabase
    .from('maquila_producto')
    .select('id, clave')
    .eq('org_id', orgId)
  const idPorClave = new Map((catalogo ?? []).map((p) => [p.clave, p.id]))

  const { data: corte, error: cErr } = await supabase
    .from('inventario_corte')
    .upsert(
      { org_id: orgId, fecha: inv.fecha, origen_archivo: nombreArchivo, origen_hash: hash },
      { onConflict: 'org_id,fecha' },
    )
    .select('id')
    .single()
  if (cErr) throw new Error(cErr.message)
  const corteId = corte.id

  await supabase.from('inventario_linea').delete().eq('corte_id', corteId)

  if (inv.lineas.length > 0) {
    const { error } = await supabase.from('inventario_linea').insert(
      inv.lineas.map((l) => ({
        org_id: orgId,
        corte_id: corteId,
        especie: l.especie,
        producto_id: l.clave ? (idPorClave.get(l.clave) ?? null) : null,
        producto_texto: l.productoTexto,
        entradas_sacos: l.entradasSacos,
        entradas_kg: l.entradasKg,
        salidas_sacos: l.salidasSacos,
        salidas_kg: l.salidasKg,
        stock_kg: l.stockKg,
        stock_sacos: l.stockSacos,
        quintales: l.quintales,
      })),
    )
    if (error) throw new Error(error.message)
  }

  return { tipo: 'inventario', fecha: inv.fecha, lineas: inv.lineas.length, avisos }
}

// ----------------------------------------------------------------------------
// Hoja SALIDA del MASTER (la programación de entregas).
//
// Se importa la hoja COMPLETA de una vez, así que se borra y se reinserta: no
// hay una llave natural estable para todas las filas (las nacionales repiten
// folio el mismo día) y un upsert dejaría vivos los renglones que el encargado
// haya borrado del Excel.
// ----------------------------------------------------------------------------
export async function importarSalidas(supabase, orgId, bytes, nombreArchivo) {
  const res = parsearSalidas(bytes, nombreArchivo)
  const avisos = validarSalidas(res)

  // Enlaces: el número de maquila del embarque ('MAQ-013') contra los cortes ya
  // cargados, y el número de lote contra los lotes de esos cortes. Lo que no
  // exista queda en null: la hoja SALIDA cubre lotes 1–59 pero sólo tenemos los
  // formatos de los cortes 13–19, y eso es correcto, no un error.
  const { data: maquilas } = await supabase
    .from('maquilas')
    .select('id, numero')
    .eq('org_id', orgId)
    .not('numero', 'is', null)
  const idPorNumero = new Map((maquilas ?? []).map((m) => [m.numero, m.id]))

  const { data: lotes } = await supabase
    .from('maquila_lote')
    .select('id, numero_lote')
    .eq('org_id', orgId)
  const idPorLote = new Map((lotes ?? []).map((l) => [l.numero_lote, l.id]))

  await supabase.from('maquila_salida').delete().eq('org_id', orgId)

  let enlazadasMaquila = 0
  let enlazadasLote = 0

  const filas = res.salidas.map((s) => {
    const maquilaId = s.maquilaNumero != null ? (idPorNumero.get(s.maquilaNumero) ?? null) : null
    const loteId = s.numeroLote != null ? (idPorLote.get(s.numeroLote) ?? null) : null
    if (maquilaId) enlazadasMaquila++
    if (loteId) enlazadasLote++
    return {
      org_id: orgId,
      tipo_salida: s.tipoSalida,
      fecha_salida: s.fechaSalida,
      maquila_id: maquilaId,
      lote_id: loteId,
      especie: s.productoTexto,
      producto_texto: s.productoTexto,
      clasificacion: s.clasificacion,
      guia: s.guia,
      folio: s.folio,
      numero_lote: s.numeroLote,
      destino: s.destino,
      sacos: s.sacos,
      quintales: s.quintales,
      lote_oic: s.loteOic,
      transporte: s.transporte,
      canal: s.canal,
      placas: s.placas,
      observacion: s.observacion,
    }
  })

  if (filas.length > 0) {
    const { error } = await supabase.from('maquila_salida').insert(filas)
    if (error) throw new Error(error.message)
  }

  return {
    tipo: 'salidas',
    salidas: filas.length,
    exportaciones: res.salidas.filter((s) => s.tipoSalida === 'exportacion').length,
    nacionales: res.salidas.filter((s) => s.tipoSalida === 'nacional').length,
    enlazadasMaquila,
    enlazadasLote,
    avisos,
  }
}
