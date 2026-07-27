// Importa el padrón de café ÁRABE desde el LPA de café general 2024.
// Fuente: hoja "LPA CAFE GRAL.2024". El archivo es a NIVEL PRODUCTOR (no trae
// códigos de parcela), así que a cada productor se le crea una parcela
// representativa <CODIGO>-A con su superficie total; el inspector luego puede
// afinar parcelas y levantar el polígono con GPS desde la ficha.
//
// Los productores se marcan tipo_productor='cafe', cafe_variedad='arabe' para
// que al levantar una ficha de árabe solo salgan ellos (no los robusteros).
//
// Requiere la migración 0043 (columna cafe_variedad). Uso:
//   node scripts/import-padron-arabe.mjs           -> SIMULACIÓN
//   node scripts/import-padron-arabe.mjs --commit  -> aplica
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { leerXlsx } from '../src/lib/xlsx-read.mjs'

const COMMIT = process.argv.includes('--commit')
const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const FILE = 'C:/Users/jorge/Documents/CASFA SIC FILES/LPA CAFE GENERAL 2024 FINAL LISTO (2).xlsx'
const hoja = leerXlsx(readFileSync(FILE)).hoja('LPA CAFE GRAL.2024')

const txt = (v) => String(v ?? '').trim()
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null }
const anio = (v) => { const n = parseInt(txt(v), 10); return n > 1900 && n < 2100 ? n : null }
// El LPA usa H=hombre / M=mujer; la BD usa M/F. Se deduce de la CURP si falta.
function sexoBD(lpa, curp) {
  const s = txt(lpa).toUpperCase().charAt(0)
  if (s === 'H') return 'M'
  if (s === 'M') return 'F'
  const c = txt(curp).toUpperCase().charAt(10)
  if (c === 'H') return 'M'
  if (c === 'M') return 'F'
  return null
}

// Cols: [6]Estatus2024 [8]Código [9]INE [10]CURP [11]Nombre [12]Sexo
//       [13]Comunidad [14]Municipio [15]Superficie total (ha) [38]Año ingreso
const porCodigo = new Map()
for (let r = 3; r < hoja.length; r++) {
  const f = hoja[r] ?? []
  const codigo = txt(f[8]).toUpperCase()
  if (!/^[A-Z]{2}\d{4,}$/.test(codigo)) continue
  if (porCodigo.has(codigo)) continue
  porCodigo.set(codigo, {
    codigo,
    nombre_completo: txt(f[11]),
    ine: txt(f[9]) || null,
    curp: txt(f[10]).toUpperCase() || null,
    sexo: sexoBD(f[12], f[10]),
    comunidad: txt(f[13]) || null,
    municipio: txt(f[14]) || null,
    superficie: num(f[15]),
    anio_ingreso: anio(f[38]),
    estatus: txt(f[6]) || null,
  })
}
const prods = [...porCodigo.values()].filter((p) => p.nombre_completo)
console.log(`Árabe en el archivo: ${prods.length} productores`)

const { data: org } = await admin.from('organizaciones').select('id').eq('slug', 'casfa').single()
const { data: existentes } = await admin.from('productores').select('codigo')
const yaHay = new Set((existentes ?? []).map((p) => p.codigo.toUpperCase()))

const nuevos = prods.filter((p) => !yaHay.has(p.codigo))
const chocan = prods.filter((p) => yaHay.has(p.codigo))
console.log(`  nuevos: ${nuevos.length} · ya existen (se omiten): ${chocan.length}`)
nuevos.slice(0, 8).forEach((p) => console.log('   + ', p.codigo, '·', p.nombre_completo, '·', p.comunidad ?? '', '·', p.superficie ?? '?', 'ha', p.estatus ? `[${p.estatus}]` : ''))
if (chocan.length) console.log('   colisiones:', chocan.map((p) => p.codigo).join(', '))

if (!COMMIT) { console.log('\n(SIMULACIÓN) corre con --commit para aplicar.'); process.exit(0) }

let okP = 0, okPa = 0
for (const p of nuevos) {
  const { data, error } = await admin.from('productores').insert({
    org_id: org.id, codigo: p.codigo, nombre_completo: p.nombre_completo,
    curp: p.curp, ine: p.ine, sexo: p.sexo, anio_ingreso: p.anio_ingreso,
    comunidad: p.comunidad, municipio: p.municipio,
    tipo_productor: 'cafe', cafe_variedad: 'arabe',
  }).select('id').single()
  if (error) { console.log('  ERROR productor', p.codigo, error.message); continue }
  okP++
  const { error: paErr } = await admin.from('parcelas').insert({
    org_id: org.id, productor_id: data.id, codigo_parcela: `${p.codigo}-A`,
    nombre: p.comunidad || 'Parcela principal', comunidad: p.comunidad, municipio: p.municipio,
    tipo_cultivo: 'cafe', superficie_declarada_ha: p.superficie,
  })
  if (paErr) console.log('  ERROR parcela', p.codigo, paErr.message)
  else okPa++
}
console.log(`\nHecho. Productores árabe: +${okP} · parcelas: +${okPa}`)
