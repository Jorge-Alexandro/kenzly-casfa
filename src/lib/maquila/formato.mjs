// ============================================================================
// Parser de los formatos de acopio que entrega el encargado (FORMATO MAQUILA,
// FORMATO DE REPASO, INVENTARIO DE MATERIA PRIMA).
// ----------------------------------------------------------------------------
// Es POR ETIQUETA, no por coordenada, y eso no es un lujo: los renglones se
// mueven entre archivos. 'ORO EXPORTACION' está en B18 en la maquila 19 y en
// B17 en la 14, porque quien llena el formato inserta y borra filas. Un parser
// anclado a celdas fijas se rompe en el archivo siguiente y devuelve números
// plausibles pero equivocados, que es el peor modo de fallo posible para un
// inventario. Aquí se busca el rótulo y se lee a partir de él.
//
// Corre igual en navegador y servidor (el importador lo usa en ambos lados:
// preview en el cliente, autoridad en el server).
//
// No inventa datos: lo que no encuentra queda null y lo reporta el validador
// (lib/maquila/validacion.mjs). Un formato que no cuadra se importa CON sus
// avisos; no se "arregla" en silencio.
// ============================================================================
import { leerXlsx } from '../xlsx-read.mjs'

// ----------------------------------------------------------------------------
// Utilidades de texto: el encargado escribe con acentos, dobles espacios,
// mayúsculas inconsistentes y erratas fijas ('DESMACHE' por 'DESMANCHE').
// ----------------------------------------------------------------------------
export function norm(v) {
  if (v == null) return ''
  return String(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // fuera acentos
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const n = Number(v.replace(/[, ]/g, ''))
    return Number.isFinite(n) && v.trim() !== '' ? n : null
  }
  return null
}
const num0 = (v) => num(v) ?? 0
const ent = (v) => Math.round(num0(v))

/** Saco estándar del beneficio. OJO: el saco de LOTE de embarque es de 70 kg. */
export const KG_POR_SACO = 69

/** Suma preservando null: null + null = null, null + 5 = 5. */
const sumaOpcional = (a, b) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0))

const MESES = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
  JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
}

/** '08 DE JULIO 2026' | Date | serial → 'YYYY-MM-DD'. null si no se entiende. */
export function fecha(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10)
  }
  const t = norm(v)
  if (!t) return null
  const m = t.match(/(\d{1,2})\s*(?:DE\s+)?([A-Z]+)\s*(?:DEL?\s+)?(\d{4})/)
  if (m && MESES[m[2]]) {
    const [, d, mes, a] = m
    return `${a}-${String(MESES[mes]).padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return iso[0]
  const dmy = t.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return null
}

// ----------------------------------------------------------------------------
// Búsqueda de rótulos en la matriz de la hoja.
// ----------------------------------------------------------------------------
/** Primera celda cuyo texto normalizado cumple `pred`. → {f, c, v} | null */
function buscar(filas, pred, desdeFila = 0) {
  for (let f = desdeFila; f < filas.length; f++) {
    const fila = filas[f] ?? []
    for (let c = 0; c < fila.length; c++) {
      const t = norm(fila[c])
      if (t && pred(t)) return { f, c, v: fila[c] }
    }
  }
  return null
}

const buscarIgual = (filas, txt, desde = 0) =>
  buscar(filas, (t) => t === norm(txt), desde)
const buscarEmpieza = (filas, txt, desde = 0) =>
  buscar(filas, (t) => t.startsWith(norm(txt)), desde)

const celda = (filas, f, c) => (filas[f]?.[c] ?? null)

/**
 * Valor a la derecha de un rótulo: primera celda no vacía en las siguientes
 * `alcance` columnas de la misma fila. Así no importa si el número está pegado
 * al rótulo o tres columnas más allá por celdas combinadas.
 */
function derechaDe(filas, f, c, alcance = 8) {
  for (let i = c + 1; i <= c + alcance; i++) {
    const v = celda(filas, f, i)
    if (v !== null && v !== '') return v
  }
  return null
}

/**
 * Primera celda no vacía ARRIBA (paso -1) o ABAJO (paso +1) de un rótulo, en su
 * misma columna, saltando filas en blanco.
 *
 * Los rótulos NO están pegados a su dato: en el repaso la fecha va en la fila 5
 * y 'FECHA DE CORTE' en la 7, con la 6 vacía; en el inventario 'ESPECIE' va en
 * la 9 y la especie en la 11. Leer f±1 a ciegas devuelve el hueco.
 */
function vecinoDe(filas, f, c, paso, alcance = 3) {
  for (let i = 1; i <= alcance; i++) {
    const v = celda(filas, f + paso * i, c)
    if (v !== null && String(v).trim() !== '') return v
  }
  return null
}

// ----------------------------------------------------------------------------
// Catálogo de productos: el mismo que siembra 0023_maquila.sql. Se lleva aquí
// para que el parser pueda normalizar sin ir a la base (el preview del
// navegador no tiene sesión todavía). La BD sigue siendo la autoridad: el
// importador resuelve la clave contra maquila_producto.alias.
// ----------------------------------------------------------------------------
export const PRODUCTOS = [
  { clave: 'ORO_EXPORTACION', grupo: 'primeras', alias: ['ORO EXPORTACION', 'ORO EXPORTACION ARABE (PRIMERAS)', 'ORO EXPORTACION ROBUSTA(PRIMERAS)', 'ORO EXPORTACION ROBUSTA (PRIMERAS)', 'EXPORTACION'] },
  { clave: 'CARACOL', grupo: 'primeras', alias: ['CARACOL'] },
  { clave: 'CLASIFICADORA', grupo: 'segundas', alias: ['DESMANCHE CLASIFICADORA', 'DESMACHE CLASIFICADORA', 'ORO SEGUNDAS (CLASIFICADORA)', 'ORO SEGUNDA (CLASIFICADORA)', 'CLASIFICADORA'] },
  { clave: 'OLIVER', grupo: 'segundas', alias: ['DESMACHE OLIVER', 'DESMANCHE OLIVER', 'ORO SEGUNDA (OLIVER)', 'ORO SEGUNDAS (OLIVER)', 'OLIVER'] },
  { clave: 'ELECTRONICA', grupo: 'segundas', alias: ['DESMACHE ELECTRONICA', 'DESMANCHE ELECTRONICA', 'ORO SEGUNDAS (ELECTRONICA)', 'ORO SEGUNDA (ELECTRONICA)', 'ELECTRONICA'] },
  { clave: 'PL', grupo: 'segundas', alias: ['PL', 'PL DE CLASIFICADORA', 'PL DE ELECTRONICA', 'ORO SEGUNDAS(PL)', 'ORO SEGUNDAS (PL)'] },
  { clave: 'ORO_NATURAL', grupo: 'segundas', alias: ['ORO NATURAL'] },
  { clave: 'GRANZA', grupo: 'terceras', alias: ['GRANZA', 'ORO TERCERAS(GRANZA)', 'ORO TERCERAS (GRANZA)'] },
  { clave: 'CEREZO', grupo: 'terceras', alias: ['CERESO', 'CEREZO', 'ORO TERCERAS(CEREZO)', 'ORO TERCERAS (CEREZO)', 'ORO TERCERAS(CERESO)'] },
  { clave: 'REPASO_CLASIFICADORA', grupo: 'terceras', alias: ['REPASO DE CLASIFICADORA', 'ORO TERCERAS(REPASO DE CLASIFICADORA)', 'ORO TERCERAS (REPASO DE CLASIFICADORA)'] },
  { clave: 'BASURA', grupo: 'merma', alias: ['BASURA'] },
]

const INDICE_ALIAS = (() => {
  const m = new Map()
  for (const p of PRODUCTOS) for (const a of p.alias) m.set(norm(a), p)
  return m
})()

/** 'DESMACHE OLIVER' → { clave: 'OLIVER', grupo: 'segundas' }. null si no mapea. */
export function productoDe(texto) {
  const t = norm(texto)
  if (!t) return null
  return INDICE_ALIAS.get(t) ?? null
}

// ----------------------------------------------------------------------------
// Especie / tipo de materia prima, a partir de cómo lo escribe el encargado:
//   'ARABE PERGAMINO' | 'ORO ARABE' | 'CEREZO ROBUSTA' | 'ROBUSTA EN BOLA'
// ----------------------------------------------------------------------------
export function especieTipo(texto) {
  const t = norm(texto)
  const especie = /ROBUSTA/.test(t) ? 'ROBUSTA' : /CACAO/.test(t) ? 'CACAO' : 'ARABE'
  let tipo = null
  if (/PERGAMINO/.test(t)) tipo = 'PERGAMINO'
  else if (/CEREZ|CERES/.test(t)) tipo = 'CEREZO'
  else if (/\bORO\b/.test(t)) tipo = 'ORO'
  else if (/BOLA/.test(t)) tipo = 'CEREZO'
  return { especie, tipo }
}

// ----------------------------------------------------------------------------
// FORMATO MAQUILA / FORMATO DE REPASO
// ----------------------------------------------------------------------------

/** Rótulos del bloque de cuadre de sacos (pie del formato) → campo. */
const CUADRE = [
  ['SACOS ENVIADOS EN LOS LOTES', 'sacosEnviadosLotes'],
  ['SACOS DE CORTES DE MAQUILAS ANTERIORES', 'sacosMaquilasPrevias'],
  ['SACOS ENVIADOS AL AREA DE TORREFACCION', 'sacosTorrefaccion'],
  ['SACOS NO ENVIADOS ORO EXPORTACION', 'sacosNoEnviados'],
  ['SACOS ENVIADOS AL AREA DE VENTA', 'sacosVenta'],
  ['SACOS ENVIADOS EN OTRO LOTE', 'sacosOtroLote'],
  ['SACOS DE PROCESOS DE REPASO', 'sacosRepaso'],
  ['TOTAL DE SACOS', 'sacosCuadreTotal'],
]

function parsearBoletas(filas) {
  if (!filas) return []
  const enc = buscarIgual(filas, 'BOLETA')
  if (!enc) return []
  const out = []
  for (let f = enc.f + 1; f < filas.length; f++) {
    const folio = celda(filas, f, enc.c)
    const t = norm(folio)
    if (t === 'TOTALES') break
    const n = num(folio)
    if (n == null) {
      if (!norm(celda(filas, f, enc.c + 1))) continue  // fila en blanco: sigue
      continue
    }
    const tipoCafe = celda(filas, f, enc.c + 2)
    out.push({
      folio: Math.round(n),
      proveedorNombre: String(celda(filas, f, enc.c + 1) ?? '').trim(),
      tipoCafe: tipoCafe ? String(tipoCafe).trim() : null,
      sacos: ent(celda(filas, f, enc.c + 3)),
      kgBrutos: num0(celda(filas, f, enc.c + 4)),
      taraKg: num0(celda(filas, f, enc.c + 5)),
      kgNetos: num0(celda(filas, f, enc.c + 6)),
      quintales: num(celda(filas, f, enc.c + 7)),
    })
  }
  return out
}

function parsearResultados(filas) {
  // El bloque arranca en el encabezado 'PRODUCTO | SACOS | KILOS | ...'
  const enc = buscarIgual(filas, 'PRODUCTO')
  if (!enc) return { resultados: [], filaFin: 0 }

  const out = []
  let f = enc.f + 1
  for (; f < filas.length; f++) {
    const etiqueta = norm(celda(filas, f, enc.c))
    if (!etiqueta) {
      // El renglón de TOTAL no trae etiqueta (sólo números). Ahí termina.
      if (num(celda(filas, f, enc.c)) != null) break
      // Fila realmente vacía → fin del bloque si ya leímos algo.
      if (out.length > 0 && (filas[f] ?? []).every((v) => v == null || v === '')) break
      continue
    }
    if (etiqueta.startsWith('SUBTOTAL')) continue   // derivado, se recalcula
    if (etiqueta.startsWith('OBSERVACION') || etiqueta.startsWith('SALIDAS')) break

    const producto = productoDe(etiqueta)
    if (!producto) continue

    const sacos = ent(celda(filas, f, enc.c + 1))
    const kilosSueltos = num0(celda(filas, f, enc.c + 2))
    const kgPorSaco = num(celda(filas, f, enc.c + 3)) ?? KG_POR_SACO
    // totalKg viene calculado en el Excel, pero se RECALCULA: es la única
    // columna de la que depende todo lo demás y el Excel arrastra fórmulas
    // rotas cuando insertan filas.
    const totalKg = sacos * kgPorSaco + kilosSueltos
    out.push({
      clave: producto.clave,
      grupo: producto.grupo,
      etiqueta: String(celda(filas, f, enc.c)).trim(),
      sacos,
      kilosSueltos,
      kgPorSaco,
      totalKg,
      totalKgExcel: num(celda(filas, f, enc.c + 5)),   // para el validador
      quintales: num(celda(filas, f, enc.c + 6)),
    })
  }

  // Un mismo producto puede venir en VARIOS renglones: el repaso lista
  // 'PL DE CLASIFICADORA' y 'PL DE ELECTRONICA', que son el mismo PL. Se suman;
  // si no, chocarían contra unique(maquila_id, producto_id) al guardar.
  const porClave = new Map()
  for (const r of out) {
    const previo = porClave.get(r.clave)
    if (!previo) {
      porClave.set(r.clave, { ...r })
      continue
    }
    previo.sacos += r.sacos
    previo.kilosSueltos += r.kilosSueltos
    previo.totalKg += r.totalKg
    previo.etiqueta += ` + ${r.etiqueta}`
    // null (la columna no existe en el formato de repaso) NO es 0: si se
    // coacciona, el validador compara contra un cero inventado y reporta un
    // descuadre falso. Sólo se suma cuando alguno de los dos trae dato.
    previo.totalKgExcel = sumaOpcional(previo.totalKgExcel, r.totalKgExcel)
    previo.quintales = sumaOpcional(previo.quintales, r.quintales)
  }
  return { resultados: [...porClave.values()], filaFin: f }
}

function parsearLotes(filas) {
  const enc = buscarEmpieza(filas, 'SALIDAS:')
  if (!enc) return []
  const out = []
  for (let f = enc.f + 1; f < Math.min(filas.length, enc.f + 30); f++) {
    const texto = String(celda(filas, f, enc.c) ?? '')
    const t = norm(texto)
    if (t.startsWith('OBSERVACION')) break
    const m = t.match(/^LOTE\s+(\d+)/)
    if (!m) continue
    out.push({
      numeroLote: Number(m[1]),
      sacos: ent(derechaDe(filas, f, enc.c, 4)),
      kg: num0(celda(filas, f, enc.c + 4)),
      descripcion: texto.trim(),
    })
  }
  return out
}

function parsearCuadre(filas) {
  const out = {}
  for (const [rotulo, campo] of CUADRE) {
    const hit = buscarIgual(filas, rotulo)
    out[campo] = hit ? ent(derechaDe(filas, hit.f, hit.c, 4)) : 0
  }
  return out
}

function parsearFirmas(filas) {
  const firmas = { elaboro: null, entrego: null, retrillero: null, calador: null }
  // 'ELABORO:' / 'ENTREGO:' llevan el nombre una fila abajo y el puesto dos.
  for (let f = 0; f < filas.length; f++) {
    const fila = filas[f] ?? []
    for (let c = 0; c < fila.length; c++) {
      const t = norm(fila[c])
      if (t !== 'ELABORO:' && t !== 'ENTREGO:') continue
      const nombre = celda(filas, f + 1, c)
      const puesto = norm(celda(filas, f + 2, c))
      if (!nombre) continue
      const n = String(nombre).trim()
      if (/RETRILLERO/.test(puesto)) firmas.retrillero = n
      else if (/CALADOR/.test(puesto)) firmas.calador = n
      else if (t === 'ELABORO:') firmas.elaboro ??= n
      else firmas.entrego ??= n
    }
  }
  return firmas
}

function parsearObservaciones(filas) {
  const enc = buscarEmpieza(filas, 'OBSERVACIONES')
  if (!enc) return null
  const partes = []
  for (let f = enc.f + 1; f < Math.min(filas.length, enc.f + 8); f++) {
    const v = celda(filas, f, enc.c)
    const t = String(v ?? '').trim()
    if (!t) continue
    if (/^SACOS DETERMINADO/i.test(norm(t))) break
    partes.push(t)
  }
  return partes.length ? partes.join(' ') : null
}

/**
 * Parsea un FORMATO MAQUILA o FORMATO DE REPASO.
 * @param {ArrayBuffer|Uint8Array} datos  bytes del .xlsx
 * @param {string} [nombreArchivo]
 */
export function parsearMaquila(datos, nombreArchivo = '') {
  const wb = leerXlsx(datos)
  const nombreHoja = wb.nombres.find((n) => norm(n) !== 'BOLETAS')
  if (!nombreHoja) throw new Error('El archivo no tiene una hoja de corte')
  const filas = wb.hoja(nombreHoja)
  const boletas = parsearBoletas(wb.hoja(wb.nombres.find((n) => norm(n) === 'BOLETAS')))

  // --- Identidad del corte -------------------------------------------------
  const enc = buscarEmpieza(filas, 'MAQUILA')
  const subtitulo = enc ? String(celda(filas, enc.f + 1, enc.c) ?? '') : ''
  const esRepasoClasificadora = !!buscarEmpieza(filas, 'PROCESO DE REPASO')

  let numero = null
  if (enc) {
    const m = norm(enc.v).match(/MAQUILA\s+(\d+)/)
    if (m) numero = Number(m[1])
  }

  const tipoProceso = esRepasoClasificadora
    ? 'repaso_clasificadora'
    : /REPASO DE ORO/.test(norm(subtitulo))
      ? 'repaso_oro'
      : 'maquila'

  // Fecha: el rótulo 'FECHA DE CORTE' va DEBAJO del valor (así está el formato),
  // pegado en la maquila y separado por una fila en blanco en el repaso.
  const rotFecha = buscarEmpieza(filas, 'FECHA DE CORTE')
  const fechaCorte = rotFecha ? fecha(vecinoDe(filas, rotFecha.f, rotFecha.c, -1)) : null

  // --- Entrada al proceso --------------------------------------------------
  let sacosEntrada = 0
  let kgEntrada = 0
  let qqEntradaExcel = null
  const rotEntrada = buscarEmpieza(filas, 'KILOGRAMOS QUE ENTRA A PROCESO')
  if (rotEntrada) {
    kgEntrada = num0(derechaDe(filas, rotEntrada.f, rotEntrada.c, 4))
    qqEntradaExcel = num(celda(filas, rotEntrada.f, rotEntrada.c + 4))
    sacosEntrada = ent(celda(filas, rotEntrada.f, rotEntrada.c + 5))
  } else {
    // Repaso de clasificadora: encabezado 'SACOS | KILOS' con los datos abajo.
    // Aquí 'KILOS' son los kilos SUELTOS, no el total: lo que entró al repaso
    // son los sacos completos MÁS esos sueltos. Tomar sólo los sueltos daba un
    // rendimiento de 5958%, que es como se detectó.
    const rotSacos = buscarIgual(filas, 'SACOS')
    if (rotSacos) {
      sacosEntrada = ent(vecinoDe(filas, rotSacos.f, rotSacos.c, 1))
      const sueltos = num0(vecinoDe(filas, rotSacos.f, rotSacos.c + 1, 1))
      kgEntrada = sacosEntrada * KG_POR_SACO + sueltos
    }
  }

  const rotRend = buscarIgual(filas, 'RENDIMIENTO')
  const rendimientoExcel = rotRend ? num(derechaDe(filas, rotRend.f, rotRend.c, 4)) : null

  const rotEst = buscarEmpieza(filas, 'ESTIMADO A OBTENER')
  const estimadoSacos = rotEst ? num(celda(filas, rotEst.f + 2, rotEst.c)) : null

  // --- Cuerpo --------------------------------------------------------------
  const { resultados } = parsearResultados(filas)
  const lotes = parsearLotes(filas)
  const cuadre = parsearCuadre(filas)
  const firmas = parsearFirmas(filas)
  const observaciones = parsearObservaciones(filas)

  // Especie/tipo: manda la boleta (dice qué entró de verdad). Si no hay
  // boletas (repaso de clasificadora), se infiere del subtítulo.
  const fuenteEspecie = boletas[0]?.tipoCafe ?? subtitulo ?? nombreHoja
  const { especie, tipo } = especieTipo(fuenteEspecie)
  const tipoEntrada = tipo ?? (tipoProceso === 'maquila' ? 'PERGAMINO' : 'ORO')

  // Si el formato no declara los kg de entrada, los suman las boletas.
  if (!kgEntrada && boletas.length) {
    kgEntrada = boletas.reduce((s, b) => s + b.kgNetos, 0)
    sacosEntrada = boletas.reduce((s, b) => s + b.sacos, 0)
  }

  const clave =
    numero != null
      ? `M-${numero}`
      : `RC-${fechaCorte ?? 'SIN-FECHA'}`

  const kgSalida = resultados.reduce((s, r) => s + r.totalKg, 0)

  return {
    nombreArchivo,
    nombreHoja,
    clave,
    numero,
    tipoProceso,
    fechaCorte,
    especie,
    tipoEntrada,
    descripcion: subtitulo.trim() || null,
    sacosEntrada,
    kgEntrada,
    qqEntradaExcel,
    rendimientoExcel,
    estimadoSacos,
    kgSalida,
    rendimiento: kgEntrada > 0 ? kgSalida / kgEntrada : null,
    resultados,
    boletas,
    lotes,
    observaciones,
    ...cuadre,
    ...firmas,
  }
}

// ----------------------------------------------------------------------------
// Hoja SALIDA del MASTER: la programación de entregas.
//
// Mezcla DOS tipos de fila bajo el mismo encabezado, y se distinguen por si
// traen número de maquila:
//   exportación (con 'MAQ-001') → guía '26/CAS-01', lote, lote OIC, transporte,
//                                 placas, 275 sacos, destino LAREDO TX
//   nacional    (sin maquila)   → folio numérico, canal (VENTAS/OFICINA,
//                                 VENTAS/BENEFICIO, TORREFACCION), sacos que
//                                 pueden ser FRACCIONARIOS (0.72 de saco)
//
// La columna 'TRANSPORTE' guarda cosas distintas en cada tipo: la paquetera en
// exportación, el canal en nacional. Se separan aquí, no en la base.
// ----------------------------------------------------------------------------
export function parsearSalidas(datos, nombreArchivo = '') {
  const wb = leerXlsx(datos)
  const nombreHoja = wb.nombres.find((n) => norm(n).startsWith('SALIDA'))
  if (!nombreHoja) throw new Error('El archivo no tiene la hoja SALIDA')
  const filas = wb.hoja(nombreHoja)

  const enc = buscarEmpieza(filas, 'FECHA')
  if (!enc) throw new Error('No se encontró el encabezado de la hoja SALIDA')

  const salidas = []
  let total = null

  for (let f = enc.f + 1; f < filas.length; f++) {
    const col0 = celda(filas, f, enc.c)
    const t = norm(col0)

    // La fila de TOTAL cierra la hoja y sirve de checksum.
    if (t.startsWith('TOTAL')) {
      total = {
        sacos: num0(celda(filas, f, enc.c + 7)),
        quintales: num0(celda(filas, f, enc.c + 8)),
      }
      break
    }
    if (t.startsWith('FORMULO')) break

    const fechaSalida = fecha(col0)
    if (!fechaSalida) continue

    const maquilaTxt = String(celda(filas, f, enc.c + 1) ?? '').trim()
    const esExportacion = !!maquilaTxt

    // 'MAQ-013' → 13. Un lote puede salir de DOS cortes ('MAQ-017-018'): se
    // atribuye al primero y se conserva el texto crudo para no perder el dato.
    const mNum = maquilaTxt.match(/(\d+)/)
    const guiaRaw = celda(filas, f, enc.c + 4)
    const transporteOCanal = String(celda(filas, f, enc.c + 11) ?? '').trim() || null

    salidas.push({
      tipoSalida: esExportacion ? 'exportacion' : 'nacional',
      fechaSalida,
      maquilaTexto: maquilaTxt || null,
      maquilaNumero: mNum ? Number(mNum[1]) : null,
      productoTexto: String(celda(filas, f, enc.c + 2) ?? '').trim() || null,
      clasificacion: String(celda(filas, f, enc.c + 3) ?? '').trim() || null,
      // La guía es texto sólo en exportación; en nacional esa celda es el folio.
      guia: esExportacion && guiaRaw != null ? String(guiaRaw).trim() : null,
      folio: esExportacion ? null : num(guiaRaw),
      numeroLote: num(celda(filas, f, enc.c + 5)),
      destino: String(celda(filas, f, enc.c + 6) ?? '').trim() || null,
      sacos: num0(celda(filas, f, enc.c + 7)),   // fraccionario en nacionales
      quintales: num(celda(filas, f, enc.c + 8)),
      loteOic: String(celda(filas, f, enc.c + 10) ?? '').trim() || null,
      transporte: esExportacion ? transporteOCanal : null,
      canal: esExportacion ? null : transporteOCanal,
      placas: String(celda(filas, f, enc.c + 12) ?? '').trim() || null,
      observacion: String(celda(filas, f, enc.c + 13) ?? '').trim() || null,
    })
  }

  return { nombreArchivo, salidas, total }
}

// ----------------------------------------------------------------------------
// INVENTARIO DE MATERIA PRIMA - PRODUCTOS TERMINADOS
//
// La hoja 'MATERIA PRIMA' es una pila de bloques; cada uno arranca con el
// rótulo 'ESPECIE' y la fila siguiente trae la especie + los encabezados.
// ----------------------------------------------------------------------------
export function parsearInventario(datos, nombreArchivo = '') {
  const wb = leerXlsx(datos)
  const nombreHoja = wb.nombres.find((n) => norm(n).startsWith('MATERIA PRIMA'))
  if (!nombreHoja) throw new Error('El archivo no tiene la hoja MATERIA PRIMA')
  const filas = wb.hoja(nombreHoja)

  const rotFecha = buscarEmpieza(filas, 'INVENTARIO A LA FECHA')
  const fechaCorte = rotFecha ? fecha(rotFecha.v) : null

  const lineas = []
  for (let f = 0; f < filas.length; f++) {
    if (norm(celda(filas, f, 1)) !== 'ESPECIE') continue

    // Fila de encabezado del bloque: col 1 = especie, col 2.. = columnas.
    // NO siempre es f+1 — el primer bloque (CAFÉ ARABE) trae una fila en blanco
    // entre 'ESPECIE' y la especie, y leer f+1 a ciegas se saltaba el bloque
    // entero de árabe, que es el más grande del inventario.
    let fEnc = f + 1
    while (fEnc < filas.length && !String(celda(filas, fEnc, 1) ?? '').trim()) fEnc++
    const especie = String(celda(filas, fEnc, 1) ?? '').trim()
    if (!especie || fEnc - f > 3) continue

    for (let r = fEnc + 1; r < filas.length; r++) {
      const etiqueta = String(celda(filas, r, 1) ?? '').trim()
      const t = norm(etiqueta)
      if (!t) break                  // bloque terminado
      if (t === 'ESPECIE') break     // empieza el siguiente

      const producto = productoDe(t)
      lineas.push({
        especie,
        productoTexto: etiqueta,
        clave: producto?.clave ?? null,
        entradasSacos: ent(celda(filas, r, 2)),
        entradasKg: num0(celda(filas, r, 3)),
        salidasSacos: ent(celda(filas, r, 4)),
        salidasKg: num0(celda(filas, r, 5)),
        stockKg: num0(celda(filas, r, 6)),
        stockSacos: ent(celda(filas, r, 7)),
        quintales: num(celda(filas, r, 8)),
      })
    }
  }

  return { nombreArchivo, fecha: fechaCorte, lineas }
}
