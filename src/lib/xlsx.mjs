// ============================================================================
// Escritor XLSX mínimo multi-hoja (sin dependencias nuevas: usa fflate).
// ----------------------------------------------------------------------------
// Un .xlsx es un zip de XML. Aquí generamos lo mínimo válido que Excel abre:
// [Content_Types], _rels, workbook + rels, y una hoja por cada {name, rows}.
// Celdas: number → numérica; string → inlineStr; null/'' → vacía.
// Se usa para el generador del LPA y otros exports. Verificado con
// scripts/verify-xlsx.mjs (se relee con el parser de Python).
// ============================================================================
import { zipSync, strToU8 } from 'fflate'

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function colRef(i) {
  let s = ''
  i += 1
  while (i > 0) {
    const r = (i - 1) % 26
    s = String.fromCharCode(65 + r) + s
    i = Math.floor((i - 1) / 26)
  }
  return s
}

function cellXml(value, ref) {
  if (value === null || value === undefined || value === '') return `<c r="${ref}"/>`
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`
}

function sheetXml(rows) {
  const body = rows
    .map((row, r) => {
      const cells = row.map((v, c) => cellXml(v, `${colRef(c)}${r + 1}`)).join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${body}</sheetData></worksheet>`
  )
}

/**
 * Construye un .xlsx.
 * @param {Array<{name:string, rows:Array<Array<string|number|null>>}>} sheets
 * @returns {Uint8Array}
 */
export function buildXlsx(sheets) {
  const files = {}

  files['[Content_Types].xml'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheets
      .map((_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    `</Types>`

  files['_rels/.rels'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`

  files['xl/workbook.xml'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    sheets
      .map((s, i) => `<sheet name="${esc(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('') +
    `</sheets></workbook>`

  files['xl/_rels/workbook.xml.rels'] =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets
      .map((_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('') +
    `</Relationships>`

  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s.rows)
  })

  const zipInput = {}
  for (const [name, content] of Object.entries(files)) zipInput[name] = strToU8(content)
  return zipSync(zipInput)
}
