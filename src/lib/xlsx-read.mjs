// ============================================================================
// Lector XLSX mínimo (sin dependencias nuevas: usa fflate, igual que xlsx.mjs).
// ----------------------------------------------------------------------------
// La contraparte de lib/xlsx.mjs: un .xlsx es un zip de XML, aquí lo abrimos.
// Resuelve sharedStrings, inlineStr, y fechas (celdas numéricas con formato de
// fecha → Date, vía el numFmt de styles.xml).
//
// Corre igual en el navegador (File → ArrayBuffer) y en el server (Buffer), que
// es justo lo que necesita el importador: el cliente parsea para el PREVIEW y
// el servidor RE-PARSEA como autoridad, con este mismo código.
//
// Devuelve hojas como matriz de celdas: leer(buf) → { nombres, hoja(nombre) }.
// Las celdas vacías son null. No interpreta fórmulas: lee el valor cacheado,
// que es lo que Excel deja guardado (y lo que el encargado ve en pantalla).
// ============================================================================
import { unzipSync, strFromU8 } from 'fflate'

/** 'BC12' → { col: 54, row: 12 } (0-based col, 1-based row, como Excel). */
function parseRef(ref) {
  let col = 0
  let i = 0
  for (; i < ref.length; i++) {
    const c = ref.charCodeAt(i)
    if (c < 65 || c > 90) break
    col = col * 26 + (c - 64)
  }
  return { col: col - 1, row: parseInt(ref.slice(i), 10) || 0 }
}

/** Extrae los <t> de un nodo (t directo, o los de <r> en texto con formato). */
function textoDeNodo(xml) {
  const partes = []
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g
  let m
  while ((m = re.exec(xml))) partes.push(m[1])
  return partes.join('')
}

function desescapar(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
}

function leerSharedStrings(zip) {
  const raw = zip['xl/sharedStrings.xml']
  if (!raw) return []
  const xml = strFromU8(raw)
  const out = []
  const re = /<si>([\s\S]*?)<\/si>/g
  let m
  while ((m = re.exec(xml))) out.push(desescapar(textoDeNodo(m[1])))
  return out
}

// numFmtId de fecha/hora built-in de Excel (14–22, 45–47) + los custom que
// declaren d/m/y en su código. Sin esto, una fecha se lee como 45678.
const FMT_FECHA_BUILTIN = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

function leerEstilosFecha(zip) {
  const raw = zip['xl/styles.xml']
  if (!raw) return new Set()
  const xml = strFromU8(raw)

  const customFecha = new Set()
  const reFmt = /<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g
  let m
  while ((m = reFmt.exec(xml))) {
    const code = desescapar(m[2]).replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '')
    if (/[dmyhs]/i.test(code) && /[dy]/i.test(code)) customFecha.add(Number(m[1]))
  }

  // cellXfs: el índice del array ES el s="N" de la celda.
  const bloque = xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)
  if (!bloque) return new Set()
  const esFecha = new Set()
  const reXf = /<xf[^>]*numFmtId="(\d+)"[^>]*\/?>/g
  let i = 0
  while ((m = reXf.exec(bloque[1]))) {
    const id = Number(m[1])
    if (FMT_FECHA_BUILTIN.has(id) || customFecha.has(id)) esFecha.add(i)
    i++
  }
  return esFecha
}

/** Serial de Excel → Date UTC. Excel cree que 1900 fue bisiesto: de ahí el −2. */
function serialAFecha(n) {
  if (!Number.isFinite(n) || n <= 0) return null
  const ms = Math.round((n - 25569) * 86400 * 1000)
  return new Date(ms)
}

/** Mapea nombre de hoja → ruta del XML dentro del zip. */
function mapaHojas(zip) {
  const wb = strFromU8(zip['xl/workbook.xml'] ?? new Uint8Array())
  const rels = strFromU8(zip['xl/_rels/workbook.xml.rels'] ?? new Uint8Array())

  const porId = {}
  const reRel = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g
  let m
  while ((m = reRel.exec(rels))) {
    let target = m[2].replace(/^\/xl\//, '').replace(/^\.\//, '')
    porId[m[1]] = target.startsWith('xl/') ? target : `xl/${target}`
  }

  const hojas = []
  const reHoja = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"[^>]*\/?>/g
  while ((m = reHoja.exec(wb))) {
    const ruta = porId[m[2]]
    if (ruta && zip[ruta]) hojas.push({ nombre: desescapar(m[1]), ruta })
  }
  return hojas
}

function leerHoja(zip, ruta, esFecha, shared) {
  const xml = strFromU8(zip[ruta])
  const filas = []

  const reFila = /<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>|<row[^>]*\/>/g
  let mf
  while ((mf = reFila.exec(xml))) {
    if (mf[1] === undefined) continue
    const nFila = Number(mf[1])
    const celdas = []

    // La rama auto-cerrada va PRIMERA y es obligatoria: si se deja que
    // `[^>]*` se coma el `/` de `<c r="C24"/>`, la celda vacía se "traga" la
    // siguiente y todos los valores de la fila se recorren de columna.
    const reCelda = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g
    let mc
    while ((mc = reCelda.exec(mf[2]))) {
      const attrs = mc[1] ?? mc[2] ?? ''
      const cuerpo = mc[3] ?? ''
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) ?? [])[1]
      if (!ref) continue
      const { col } = parseRef(ref)
      const tipo = (attrs.match(/\bt="([^"]+)"/) ?? [])[1] ?? 'n'
      const estilo = Number((attrs.match(/\bs="(\d+)"/) ?? [])[1] ?? -1)

      let valor = null
      if (tipo === 's') {
        const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1]
        valor = v != null ? (shared[Number(v)] ?? null) : null
      } else if (tipo === 'inlineStr') {
        valor = desescapar(textoDeNodo(cuerpo))
      } else if (tipo === 'str') {
        valor = desescapar((cuerpo.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1] ?? '')
      } else if (tipo === 'b') {
        const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1]
        valor = v === '1'
      } else {
        const v = (cuerpo.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1]
        if (v != null && v !== '') {
          const n = Number(v)
          valor = Number.isFinite(n) ? (esFecha.has(estilo) ? serialAFecha(n) : n) : null
        }
      }
      celdas[col] = valor
    }

    // Rellena huecos con null para que el índice de columna sea estable.
    for (let i = 0; i < celdas.length; i++) if (celdas[i] === undefined) celdas[i] = null
    filas[nFila - 1] = celdas
  }

  for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = []
  return filas
}

/**
 * Abre un .xlsx.
 * @param {ArrayBuffer|Uint8Array} datos
 * @returns {{ nombres: string[], hoja: (nombre: string) => (any[][]|null), hojas: Record<string, any[][]> }}
 */
export function leerXlsx(datos) {
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos)
  let zip
  try {
    zip = unzipSync(bytes)
  } catch {
    throw new Error('El archivo no es un .xlsx válido (no se pudo descomprimir)')
  }
  if (!zip['xl/workbook.xml']) {
    throw new Error('El archivo no es un .xlsx válido (falta xl/workbook.xml)')
  }

  const shared = leerSharedStrings(zip)
  const esFecha = leerEstilosFecha(zip)

  const hojas = {}
  const nombres = []
  for (const { nombre, ruta } of mapaHojas(zip)) {
    nombres.push(nombre)
    hojas[nombre] = leerHoja(zip, ruta, esFecha, shared)
  }

  return { nombres, hojas, hoja: (n) => hojas[n] ?? null }
}

/** Valor de una celda por índices 0-based, tolerante a filas cortas. */
export function celda(filas, fila, col) {
  const f = filas[fila]
  if (!f) return null
  const v = f[col]
  return v === undefined ? null : v
}
