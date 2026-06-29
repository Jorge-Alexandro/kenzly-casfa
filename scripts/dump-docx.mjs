// Vuelca la estructura (parrafos y tablas en orden) de un .docx para entender
// su layout. Uso: node scripts/dump-docx.mjs "ruta\\al\\archivo.docx"
import { readFileSync } from 'fs'
import { unzipSync, strFromU8 } from 'fflate'

const path = process.argv[2]
if (!path) {
  console.error('Falta la ruta del .docx')
  process.exit(1)
}

const buf = new Uint8Array(readFileSync(path))
const files = unzipSync(buf)
const xml = strFromU8(files['word/document.xml'])

// Texto de un fragmento: concatena todos los <w:t>...</w:t>.
function textOf(frag) {
  const m = frag.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []
  return m
    .map((t) => t.replace(/<[^>]+>/g, ''))
    .join('')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

// Extrae el body y recorre sus hijos directos (w:p y w:tbl) en orden.
const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/)
const body = bodyMatch ? bodyMatch[1] : xml

// Tokenizamos por bloques de nivel superior: parrafos y tablas.
const blockRe = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g
let m
let i = 0
while ((m = blockRe.exec(body)) !== null) {
  const block = m[0]
  if (block.startsWith('<w:tbl')) {
    console.log(`\n[TABLA ${++i}]`)
    const rows = block.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || []
    rows.forEach((row, r) => {
      const cells = row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || []
      const texts = cells.map((c) => textOf(c) || '·')
      console.log(`  fila ${r + 1}: | ${texts.join(' | ')} |`)
    })
  } else {
    const t = textOf(block)
    if (t) console.log(t)
  }
}
