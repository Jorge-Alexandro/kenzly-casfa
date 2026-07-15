// Verifica el motor de calidad contra las 311 entradas REALES de CASFA.xlsx
// (exportadas a scripts/_casfa_raw.json por el lector de Python).
//
// Como el histórico de AppSheet guardó sólo los porcentajes ya calculados,
// hacemos el viaje redondo: fracción → gramos → fracción. Si el motor reproduce
// la fracción original en las 311, es que la fórmula es la del manual.
//
//   node scripts/verify-calidad.mjs
import { readFileSync } from 'node:fs'
import {
  calcularCalidad,
  gramosDesdeFracciones,
  aplicaRendimiento,
} from '../src/lib/acopio/calidad.mjs'

const RAW =
  process.argv[2] ??
  'C:/Users/jorge/Documents/CASFA SIC FILES/scripts/_casfa_raw.json'
const d = JSON.parse(readFileSync(RAW, 'utf8'))

const H = {
  especie: 5, tipo: 6, rendimiento: 12,
  zaranda_16: 13, zaranda_15: 14, caracol: 15, mancha: 16, humedad: 17,
}
const f = (v) => (v == null || v === '' ? null : Number(v))

// Normas por producto (las mismas que siembra la migración 0017).
const CFG = {
  'ARABE|PERGAMINO': { muestra_g: 300, analisis_g: 100, rend_min: 0.81, mancha_max: 0.12 },
  'ROBUSTA|CEREZO': { muestra_g: 300, analisis_g: 100, rend_min: 0.6, mancha_max: 0.16 },
  'ARABE|ORO': { analisis_g: 100 },
  'ROBUSTA|ORO': { analisis_g: 100 },
  'CACAO|FERMENTADO': {},
  'CACAO|LAVADO': {},
}

let n = 0, ok = 0
const fallas = []

for (const r of d.Entrada.slice(1)) {
  const especie = r[H.especie], tipo = r[H.tipo]
  const conRend = aplicaRendimiento(especie, tipo)
  const cfg = { ...(CFG[`${especie}|${tipo}`] ?? {}), rendimiento_aplica: conRend }

  const orig = {
    // AppSheet ponía 1.0 de relleno donde no se mide rendimiento (café oro y
    // cacao). Aquí eso es null = no aplica, que es lo que va a la base.
    rendimiento: conRend ? f(r[H.rendimiento]) : null,
    zaranda_16: f(r[H.zaranda_16]),
    zaranda_15: f(r[H.zaranda_15]),
    caracol: f(r[H.caracol]),
    mancha: f(r[H.mancha]),
    humedad: f(r[H.humedad]),
  }
  if (f(r[H.rendimiento]) == null) continue
  n++

  // fracción guardada → gramos de báscula → el motor los vuelve a %
  const gramos = gramosDesdeFracciones(orig, cfg)
  const res = calcularCalidad(gramos, cfg)

  const difs = []
  for (const k of ['rendimiento', 'zaranda_16', 'zaranda_15', 'caracol', 'mancha', 'humedad']) {
    if (orig[k] == null && res[k] == null) continue
    if (orig[k] == null || res[k] == null) { difs.push(`${k}: ${orig[k]} vs ${res[k]}`); continue }
    if (Math.abs(orig[k] - res[k]) > 0.0001) difs.push(`${k}: ${orig[k]} vs ${res[k]}`)
  }
  if (difs.length === 0) ok++
  else fallas.push({ folio: r[0], especie, tipo, difs })
}

console.log(`Entradas con calidad capturada: ${n}`)
console.log(`Reproducidas exactas por el motor: ${ok}`)
console.log(`Diferencias: ${fallas.length}`)
for (const x of fallas.slice(0, 10)) {
  console.log(`  #${x.folio} ${x.especie} ${x.tipo} → ${x.difs.join(' | ')}`)
}

// El invariante del método: los 4 montones reparten los 100 g del oro.
let conCuatro = 0, suman100 = 0
const raros = []
for (const r of d.Entrada.slice(1)) {
  const v = ['zaranda_16', 'zaranda_15', 'caracol', 'mancha'].map((k) => f(r[H[k]]))
  if (v.some((x) => x == null)) continue
  conCuatro++
  const g = calcularCalidad(
    gramosDesdeFracciones(
      { zaranda_16: v[0], zaranda_15: v[1], caracol: v[2], mancha: v[3] },
      { analisis_g: 100 },
    ),
    { analisis_g: 100, rendimiento_aplica: false },
  )
  if (Math.abs(g.suma_analisis_g - 100) <= 0.5) suman100++
  else raros.push(`#${r[0]} suma ${g.suma_analisis_g} g`)
}
console.log(`\nInvariante (z16+z15+caracol+mancha = 100 g de oro):`)
console.log(`  entradas con las 4 categorías: ${conCuatro}`)
console.log(`  cuadran con 100 g           : ${suman100}`)
console.log(`  no cuadran (error de dedo)  : ${raros.length}  ${raros.join(', ')}`)

// ¿A quién NO se le mide rendimiento? Café que entró ya en oro (no se acopió en
// pergamino/cereza) y cacao (no lleva análisis). AppSheet les ponía 1.0.
const grupos = new Map()
for (const r of d.Entrada.slice(1)) {
  const especie = r[H.especie], tipo = r[H.tipo]
  const k = `${especie} ${tipo}`
  const g = grupos.get(k) ?? { n: 0, rend1: 0, conZaranda: 0, aplica: aplicaRendimiento(especie, tipo) }
  g.n++
  if (f(r[H.rendimiento]) === 1) g.rend1++
  if (f(r[H.zaranda_16]) != null) g.conZaranda++
  grupos.set(k, g)
}
console.log(`\nRendimiento "100 %" en AppSheet = relleno, no medición:`)
let coherente = true
for (const [k, g] of grupos) {
  const nota = g.aplica ? 'se mide' : 'NO APLICA → null'
  console.log(
    `  ${k.padEnd(18)} n=${String(g.n).padStart(3)}  rend=100%: ${String(g.rend1).padStart(3)}` +
      `  con zarandas: ${String(g.conZaranda).padStart(3)}   ${nota}`,
  )
  // Si no aplica, AppSheet debía traer 1.0 en TODAS; si aplica, en NINGUNA.
  if (!g.aplica && g.rend1 !== g.n) coherente = false
  if (g.aplica && g.rend1 !== 0) coherente = false
}
console.log(`  coherente con los datos: ${coherente ? 'sí' : 'NO'}`)

process.exit(fallas.length === 0 && coherente ? 0 : 1)
