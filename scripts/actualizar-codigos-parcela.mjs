// Actualiza codigo_parcela al esquema nuevo del SIC: <codigoProductor>-<A|B|C…>
// Fuente: LPA 2026-2027 ROBUSTA (hoja "LPA ROBUSTEROS 2026"), columnas:
//   [7] Código productor · [17] Nombre Parcela 2024 · [19] Codigo de parcela
//
// Empareja por (código de productor + nombre de parcela normalizado) y solo
// aplica coincidencias ÚNICAS. Deja plan CSV en scripts/_plan_codigos.csv.
//
// Uso:
//   node scripts/actualizar-codigos-parcela.mjs            -> SIMULACIÓN
//   node scripts/actualizar-codigos-parcela.mjs --commit   -> aplica
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { leerXlsx } from '../src/lib/xlsx-read.mjs'

const COMMIT = process.argv.includes('--commit')
const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const LPA = 'C:/Users/jorge/Documents/CASFA SIC FILES/RECOMENDACIONES/2026-2027LPA ROBUSTA FINCA CHULA VISTA.xlsx'

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// --- 1. Leer LPA -> filas { codProd, nombreParcela, codigoNuevo } ---
const wb = leerXlsx(readFileSync(LPA))
const hoja = wb.hoja('LPA ROBUSTEROS 2026')
const filas = []
for (let r = 3; r < hoja.length; r++) {
  const f = hoja[r] ?? []
  const codProd = String(f[7] ?? '').trim()
  const nombreParcela = String(f[17] ?? '').trim()
  const codigoNuevo = String(f[19] ?? '').trim()
  if (!codProd || !codigoNuevo || !/^[A-Z]{2}\d+/.test(codProd)) continue
  filas.push({ codProd, nombreParcela, codigoNuevo })
}
// dedupe por codigoNuevo (el LPA repite bloques)
const porCodigo = new Map()
for (const f of filas) if (!porCodigo.has(f.codigoNuevo)) porCodigo.set(f.codigoNuevo, f)
const lpa = [...porCodigo.values()]
console.log(`LPA: ${lpa.length} parcelas con código nuevo (${filas.length} filas)`)

// --- 2. Parcelas de la app ---
const { data: prod } = await admin.from('productores').select('id, codigo')
const { data: parc } = await admin.from('parcelas').select('id, productor_id, codigo_parcela, nombre')
const prodByCode = Object.fromEntries(prod.map((p) => [p.codigo, p.id]))
const parcByProd = {}
for (const p of parc) (parcByProd[p.productor_id] ??= []).push(p)
const codigosOcupados = new Set(parc.map((p) => p.codigo_parcela))

// --- 3. Emparejar ---
const plan = []
let unico = 0, ambiguo = 0, sinProd = 0, sinParcela = 0, yaAplicado = 0
for (const row of lpa) {
  const prodId = prodByCode[row.codProd]
  if (!prodId) { sinProd++; plan.push({ ...row, estado: 'PRODUCTOR NO ESTÁ EN LA APP', parcela: '' }); continue }
  const candidatas = (parcByProd[prodId] ?? []).filter((p) => norm(p.nombre) === norm(row.nombreParcela))
  if (candidatas.length === 0) {
    sinParcela++
    plan.push({ ...row, estado: 'PARCELA NO ENCONTRADA (por nombre)', parcela: '' })
  } else if (candidatas.length > 1) {
    ambiguo++
    plan.push({ ...row, estado: 'AMBIGUO (varias parcelas con ese nombre)', parcela: candidatas.map((c) => c.codigo_parcela).join(' / ') })
  } else if (candidatas[0].codigo_parcela === row.codigoNuevo) {
    yaAplicado++
    plan.push({ ...row, estado: 'YA APLICADO', parcela: candidatas[0].codigo_parcela })
  } else {
    unico++
    plan.push({ ...row, estado: 'ACTUALIZAR', parcela: candidatas[0].codigo_parcela, _id: candidatas[0].id })
  }
}

// choques: dos parcelas destino con el mismo código nuevo, o código ya usado por otra
const aActualizar = plan.filter((p) => p.estado === 'ACTUALIZAR')

const cols = ['codigoNuevo', 'codProd', 'nombreParcela', 'estado', 'parcela']
const csv = [cols.join(',')]
for (const r of plan) csv.push(cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))
writeFileSync('scripts/_plan_codigos.csv', '﻿' + csv.join('\n'))

console.log('=== PLAN ===')
console.log('ACTUALIZAR      :', unico)
console.log('YA APLICADO     :', yaAplicado)
console.log('AMBIGUO         :', ambiguo)
console.log('SIN PARCELA     :', sinParcela)
console.log('SIN PRODUCTOR   :', sinProd)
console.log('Detalle -> scripts/_plan_codigos.csv')

if (!COMMIT) { console.log('\n(SIMULACIÓN) corre con --commit para aplicar.'); process.exit(0) }

console.log('\n=== APLICANDO ===')
let ok = 0, err = 0
for (const r of aActualizar) {
  if (codigosOcupados.has(r.codigoNuevo)) { err++; console.log('  CHOQUE, ya existe:', r.codigoNuevo); continue }
  const { error } = await admin.from('parcelas').update({ codigo_parcela: r.codigoNuevo }).eq('id', r._id)
  if (error) { err++; console.log('  ERROR', r.codigoNuevo, ':', error.message) }
  else { ok++; codigosOcupados.add(r.codigoNuevo) }
}
console.log(`\nHecho. Actualizados: ${ok}  Errores/choques: ${err}`)
