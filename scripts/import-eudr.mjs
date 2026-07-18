// Importa el VEREDICTO OFICIAL EUDR (MAYACERT) a parcela_eudr.
// Fuente: carpeta de resultados con geojson por parcela:
//   V. GeoJson Parcelas/1. Parcelas EUDR Verified/<codigo>.geojson    -> verificada
//   V. GeoJson Parcelas/2. Parcelas con Deforestacion/<codigo>.geojson -> deforestacion
//
// Empareja por código base (MX003272-a -> parcela cuyo codigo_parcela empieza
// con MX003272). Requiere la migración 0030.
//
// Uso:
//   node scripts/import-eudr.mjs           -> SIMULACIÓN (emparejamiento)
//   node scripts/import-eudr.mjs --commit  -> escribe en parcela_eudr
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'

const COMMIT = process.argv.includes('--commit')
const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const RAIZ = 'C:/Users/jorge/Documents/CASFA SIC FILES/Resultados de la Verificación de Cumplimiento EUDR – Centro Agroecológico San Francisco de Asís S.A. de C.V/V. GeoJson Parcelas'
const FUENTE = 'MAYACERT 2026'
const FECHA = '2026-07-01'

// Subcarpetas (los nombres traen acentos combinados; los ubicamos por prefijo).
const subs = readdirSync(RAIZ, { withFileTypes: true }).filter((d) => d.isDirectory())
const dirVerif = subs.find((d) => /verified/i.test(d.name))?.name
const dirDefor = subs.find((d) => /deforesta/i.test(d.name))?.name

function codigos(dir) {
  if (!dir) return []
  return readdirSync(`${RAIZ}/${dir}`).filter((f) => f.toLowerCase().endsWith('.geojson')).map((f) => f.replace(/\.geojson$/i, ''))
}
const verif = codigos(dirVerif)
const defor = codigos(dirDefor)
console.log(`Verificadas: ${verif.length} | Deforestación: ${defor.length}`)

const { data: org } = await admin.from('organizaciones').select('id').eq('slug', 'casfa').single()
const { data: parc } = await admin.from('parcelas').select('id, codigo_parcela')
// índice por código base (letras+dígitos iniciales, en mayúsculas)
const baseDe = (cod) => (String(cod).toUpperCase().match(/^[A-Z]+\d+/) || [''])[0]
const porBase = {}
for (const p of parc) (porBase[baseDe(p.codigo_parcela)] ??= []).push(p)

let ok = 0, noMatch = 0, ambig = 0
const filas = []
function procesar(lista, estatus) {
  for (const cod of lista) {
    const base = baseDe(cod)
    const cand = porBase[base] ?? []
    if (cand.length === 0) { noMatch++; if (estatus === 'deforestacion' || noMatch <= 8) console.log(`  ✗ ${cod} (${estatus}) -> sin parcela`); continue }
    // suffix a/b/c -> índice; si solo hay 1, esa
    const m = cod.toUpperCase().match(/-([A-Z])$/)
    let elegida = cand[0]
    if (cand.length > 1 && m) {
      const idx = m[1].charCodeAt(0) - 65
      elegida = cand[idx] ?? cand[0]
      if (!cand[idx]) ambig++
    }
    ok++
    filas.push({ parcela_id: elegida.id, org_id: org.id, estatus_oficial: estatus, fuente: FUENTE, fecha_oficial: FECHA })
  }
}
procesar(defor, 'deforestacion') // primero: tiene prioridad si hay choque
procesar(verif, 'verificada')

// Dedupe por parcela_id (una parcela puede tener varios geojson): conserva la
// primera vista, y deforestación gana sobre verificada.
const porParcela = new Map()
for (const f of filas) {
  const prev = porParcela.get(f.parcela_id)
  if (!prev || (f.estatus_oficial === 'deforestacion' && prev.estatus_oficial !== 'deforestacion')) {
    porParcela.set(f.parcela_id, f)
  }
}
const unicas = [...porParcela.values()]

console.log(`\nEmparejadas: ${ok} | sin parcela: ${noMatch} | únicas: ${unicas.length}`)
console.log('Deforestación:', unicas.filter((f) => f.estatus_oficial === 'deforestacion').length)

if (!COMMIT) { console.log('\n(SIMULACIÓN) corre con --commit para escribir en parcela_eudr.'); process.exit(0) }

let esc = 0
for (let i = 0; i < unicas.length; i += 200) {
  const lote = unicas.slice(i, i + 200)
  const { error } = await admin.from('parcela_eudr').upsert(lote, { onConflict: 'parcela_id' })
  if (error) { console.log('ERROR lote', i, error.message); break }
  esc += lote.length
}
console.log(`\nHecho. Escritas: ${esc}`)
