// Actualiza el PADRÓN (productores + parcelas) desde el LPA 2026-2027.
// Fuente: hoja "LPA ROBUSTEROS 2026". Columnas (0-based):
//   [5] Estatus 2026 · [7] Código productor · [8] No. identificación (INE)
//   [9] CURP · [13] Nombre completo · [14] Sexo (H/M) · [16] Año ingreso
//   [17] Nombre parcela · [19] Código de parcela · [20] Comunidad · [22] Municipio
//   [24] Lat · [25] Lng · [26] Total café (ha)
//
// OJO: el LPA usa H=hombre / M=mujer; la BD usa M=masculino / F=femenino.
// Da de ALTA lo que falta y ACTUALIZA lo existente. Nunca borra.
//
// Uso:
//   node scripts/import-lpa-padron.mjs           -> SIMULACIÓN
//   node scripts/import-lpa-padron.mjs --commit  -> aplica
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { leerXlsx } from '../src/lib/xlsx-read.mjs'

const COMMIT = process.argv.includes('--commit')
const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const LPA = 'C:/Users/jorge/Documents/CASFA SIC FILES/RECOMENDACIONES/2026-2027LPA ROBUSTA FINCA CHULA VISTA.xlsx'
const hoja = leerXlsx(readFileSync(LPA)).hoja('LPA ROBUSTEROS 2026')
if (!hoja) { console.log('No encontré la hoja "LPA ROBUSTEROS 2026".'); process.exit(1) }

const txt = (v) => String(v ?? '').trim()
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null }
const anio = (v) => { const n = parseInt(txt(v), 10); return n > 1900 && n < 2100 ? n : null }
// LPA H/M -> BD M/F. Si falta, se deduce del carácter 11 de la CURP (H/M).
function sexoBD(lpa, curp) {
  const s = txt(lpa).toUpperCase().charAt(0)
  if (s === 'H') return 'M'
  if (s === 'M') return 'F'
  const c = txt(curp).toUpperCase().charAt(10)
  if (c === 'H') return 'M'
  if (c === 'M') return 'F'
  return null
}

// --- Leer el LPA (una fila por parcela; el productor se repite) ---
const prodPorCodigo = new Map()
const parcPorCodigo = new Map()
for (let r = 3; r < hoja.length; r++) {
  const f = hoja[r] ?? []
  const codProd = txt(f[7]).toUpperCase()
  if (!/^[A-Z]{2}\d{4,}$/.test(codProd)) continue

  const prev = prodPorCodigo.get(codProd)
  const datos = {
    codigo: codProd,
    nombre_completo: txt(f[13]),
    curp: txt(f[9]).toUpperCase() || null,
    ine: txt(f[8]) || null,
    sexo: sexoBD(f[14], f[9]),
    anio_ingreso: anio(f[16]),
    comunidad: txt(f[20]) || null,
    municipio: txt(f[22]) || null,
    estatus: txt(f[5]) || null,
  }
  // El productor se repite por parcela y algunas celdas vienen vacías:
  // nos quedamos con el primer valor NO vacío de cada campo.
  if (!prev) prodPorCodigo.set(codProd, datos)
  else for (const k of Object.keys(datos)) if (prev[k] == null || prev[k] === '') prev[k] = datos[k]

  const codParc = txt(f[19]).toUpperCase()
  if (codParc && !parcPorCodigo.has(codParc)) {
    parcPorCodigo.set(codParc, {
      codProd,
      codigo_parcela: codParc,
      nombre: txt(f[17]) || null,
      comunidad: txt(f[20]) || null,
      municipio: txt(f[22]) || null,
      superficie_declarada_ha: num(f[26]),
    })
  }
}
const prods = [...prodPorCodigo.values()].filter((p) => p.nombre_completo)
const parcs = [...parcPorCodigo.values()]
console.log(`LPA 2026-2027: ${prods.length} productores · ${parcs.length} parcelas`)

// --- Estado actual ---
const { data: org } = await admin.from('organizaciones').select('id').eq('slug', 'casfa').single()
const { data: prodBD } = await admin.from('productores').select('id, codigo, nombre_completo')
const { data: parcBD } = await admin.from('parcelas').select('id, codigo_parcela, nombre, productor_id, superficie_declarada_ha')
const idProd = new Map((prodBD ?? []).map((p) => [p.codigo.toUpperCase(), p.id]))
const codProdPorId = new Map((prodBD ?? []).map((p) => [p.id, p.codigo.toUpperCase()]))
const parcActual = new Map((parcBD ?? []).map((p) => [p.codigo_parcela.toUpperCase(), p]))

const prodNuevos = prods.filter((p) => !idProd.has(p.codigo))
const prodExist = prods.filter((p) => idProd.has(p.codigo))
const parcSupCambia = parcs.filter((p) => {
  const a = parcActual.get(p.codigo_parcela)
  return a && p.superficie_declarada_ha != null &&
    Math.abs(Number(a.superficie_declarada_ha ?? 0) - p.superficie_declarada_ha) > 0.001
})

// --- Parcelas del LPA que "faltan": ¿son ALTAS o son RENOMBRES? ---------------
// Algunas parcelas viejas quedaron con el código antiguo <CÓDIGO><Nombre> y YA
// tienen polígono/fichas. Si insertáramos el código nuevo tendríamos duplicados
// en el mapa. Buscamos entre las parcelas del mismo productor que sigan con
// formato viejo y cuadren en superficie: si hay UNA sola candidata, es renombre.
const esFormatoNuevo = (cod) => /-[A-Z]$/.test(cod)
const legacyPorProd = new Map()
for (const p of parcBD ?? []) {
  const cod = p.codigo_parcela.toUpperCase()
  if (esFormatoNuevo(cod)) continue
  const cp = codProdPorId.get(p.productor_id)
  if (!cp) continue
  if (!legacyPorProd.has(cp)) legacyPorProd.set(cp, [])
  legacyPorProd.get(cp).push(p)
}
const faltantes = parcs.filter((p) => !parcActual.has(p.codigo_parcela))
const renombres = []
const parcNuevas = []
const ambiguas = []
const usados = new Set()
for (const pa of faltantes) {
  const cands = (legacyPorProd.get(pa.codProd) ?? []).filter((c) => !usados.has(c.id))
  const igualHa = cands.filter(
    (c) => pa.superficie_declarada_ha != null &&
      Math.abs(Number(c.superficie_declarada_ha ?? -1) - pa.superficie_declarada_ha) < 0.001,
  )
  const elegidas = igualHa.length ? igualHa : cands
  if (elegidas.length === 1) { usados.add(elegidas[0].id); renombres.push({ ...pa, viejo: elegidas[0] }) }
  else if (elegidas.length === 0) parcNuevas.push(pa)
  else ambiguas.push({ ...pa, cands: elegidas })
}
// Parcelas viejas del mismo productor que el LPA 2026 ya no lista (posibles bajas).
const huerfanas = [...legacyPorProd.values()].flat()
  .filter((c) => !usados.has(c.id) && prodPorCodigo.has(codProdPorId.get(c.productor_id)))

console.log(`\nPRODUCTORES  ${prodExist.length} ya existen · ${prodNuevos.length} NUEVOS`)
prodNuevos.forEach((p) => console.log('   + ', p.codigo, '·', p.nombre_completo, '·', p.comunidad ?? '', p.estatus ? `[${p.estatus}]` : ''))

console.log(`\nPARCELAS     ${parcs.length - faltantes.length} ya existen · ${parcNuevas.length} NUEVAS · ${renombres.length} RENOMBRES · ${parcSupCambia.length} cambian superficie`)
parcNuevas.forEach((p) => console.log('   + ', p.codigo_parcela, '·', p.nombre ?? '', '· prod', p.codProd, '·', p.superficie_declarada_ha ?? '?', 'ha'))
renombres.forEach((r) => console.log('   ↻ ', `${r.viejo.codigo_parcela} → ${r.codigo_parcela}`, `· "${r.viejo.nombre}" → "${r.nombre}" ·`, r.superficie_declarada_ha, 'ha (conserva polígono e historial)'))
parcSupCambia.forEach((p) => {
  const a = parcActual.get(p.codigo_parcela)
  console.log('   ~ ', p.codigo_parcela, `${a.superficie_declarada_ha ?? '—'} → ${p.superficie_declarada_ha} ha`)
})
if (ambiguas.length) {
  console.log(`\n⚠  AMBIGUAS (no se tocan, requieren confirmación del SIC):`)
  ambiguas.forEach((p) => console.log('   ? ', p.codigo_parcela, p.nombre, '· candidatas:', p.cands.map((c) => c.codigo_parcela).join(', ')))
}
if (huerfanas.length) {
  console.log(`\nℹ  Parcelas en la BD que el LPA 2026 ya no lista (NO se borran, revisar si son baja):`)
  huerfanas.forEach((c) => console.log('   · ', c.codigo_parcela, `"${c.nombre}"`, c.superficie_declarada_ha, 'ha'))
}

if (!COMMIT) { console.log('\n(SIMULACIÓN) corre con --commit para aplicar.'); process.exit(0) }

// --- Alta de productores nuevos (prefijo CR = café robusta) ---
let okP = 0
for (const p of prodNuevos) {
  const { data, error } = await admin.from('productores').insert({
    org_id: org.id, codigo: p.codigo, nombre_completo: p.nombre_completo,
    curp: p.curp, ine: p.ine, sexo: p.sexo, anio_ingreso: p.anio_ingreso,
    comunidad: p.comunidad, municipio: p.municipio,
    tipo_productor: p.codigo.startsWith('CR') ? 'cafe' : 'tropical',
  }).select('id').single()
  if (error) console.log('  ERROR productor', p.codigo, error.message)
  else { idProd.set(p.codigo, data.id); okP++ }
}

// --- Refrescar datos de los existentes (solo campos con valor en el LPA) ---
let upP = 0
for (const p of prodExist) {
  const patch = {}
  for (const k of ['curp', 'ine', 'sexo', 'anio_ingreso', 'comunidad', 'municipio']) if (p[k]) patch[k] = p[k]
  if (!Object.keys(patch).length) continue
  const { error } = await admin.from('productores').update(patch).eq('id', idProd.get(p.codigo))
  if (!error) upP++
}

// --- Alta de parcelas nuevas ---
let okPa = 0, sinProd = 0
for (const pa of parcNuevas) {
  const prodId = idProd.get(pa.codProd)
  if (!prodId) { sinProd++; console.log('  sin productor:', pa.codigo_parcela, '->', pa.codProd); continue }
  const { error } = await admin.from('parcelas').insert({
    org_id: org.id, productor_id: prodId, codigo_parcela: pa.codigo_parcela,
    nombre: pa.nombre, comunidad: pa.comunidad, municipio: pa.municipio,
    tipo_cultivo: 'cafe', superficie_declarada_ha: pa.superficie_declarada_ha,
  })
  if (error) console.log('  ERROR parcela', pa.codigo_parcela, error.message)
  else okPa++
}

// --- Renombres: la parcela es la misma, solo cambia código/nombre ---
let okRen = 0
for (const r of renombres) {
  const { error } = await admin.from('parcelas').update({
    codigo_parcela: r.codigo_parcela,
    nombre: r.nombre,
    comunidad: r.comunidad,
    municipio: r.municipio,
    superficie_declarada_ha: r.superficie_declarada_ha,
  }).eq('id', r.viejo.id)
  if (error) console.log('  ERROR renombre', r.viejo.codigo_parcela, error.message)
  else okRen++
}

// --- Superficie declarada del ciclo 2026-2027 ---
let upSup = 0
for (const pa of parcSupCambia) {
  const { error } = await admin.from('parcelas')
    .update({ superficie_declarada_ha: pa.superficie_declarada_ha })
    .eq('id', parcActual.get(pa.codigo_parcela).id)
  if (!error) upSup++
}

console.log(`\nHecho. Productores: +${okP} nuevos, ${upP} actualizados · Parcelas: +${okPa} nuevas, ${okRen} renombradas, ${upSup} superficies actualizadas${sinProd ? ` · ${sinProd} sin productor` : ''}`)
