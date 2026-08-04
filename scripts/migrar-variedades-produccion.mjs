// La tabla "Variedades, marco de plantación y producción por variedad" de la
// ficha renombra sus columnas de producción (prod_anterior_qq/prod_actual_qq
// → prod_anterior/prod_actual, sin unidad fija en el nombre) y agrega una
// columna "unidad_prod" (QQ | KG) porque el árabe se reporta en quintales y el
// robusta en kilogramos — antes la columna decía "(qq)" para las dos, lo cual
// era falso para robusta.
//
// Esto migra lo YA capturado:
//   - copia prod_anterior_qq -> prod_anterior y prod_actual_qq -> prod_actual
//     (sin borrar las claves viejas, por si algo más las lee).
//   - pone unidad_prod = 'QQ' si la fila dice "arabe"/"árabe" y NO "robusta";
//     'KG' si dice "robusta" y NO "arabe" — la regla exacta que confirmó el
//     SIC. Si la fila menciona AMBAS variedades a la vez (p.ej. "Arabe,
//     robusta") o ninguna, no se adivina: se deja sin unidad para que alguien
//     la revise a mano, y se imprime aparte para que no pase inadvertido.
//
// Uso:
//   node scripts/migrar-variedades-produccion.mjs           -> SIMULACIÓN
//   node scripts/migrar-variedades-produccion.mjs --commit  -> aplica
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const COMMIT = process.argv.includes('--commit')
const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

function normaliza(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
function unidadDe(variedadTexto) {
  const t = normaliza(variedadTexto)
  const esArabe = /arabe/.test(t)
  const esRobusta = /robusta/.test(t)
  if (esArabe && !esRobusta) return 'QQ'
  if (esRobusta && !esArabe) return 'KG'
  return null // ambiguo (menciona ambas) o no reconocido: no se adivina
}

const { data, error } = await admin.from('fichas').select('id, tipo, respuestas')
if (error) { console.log('ERROR leyendo:', error.message); process.exit(1) }

const cambios = []
const ambiguas = []
for (const f of data ?? []) {
  const r = f.respuestas ?? {}
  const vars = r.variedades
  if (!Array.isArray(vars) || vars.length === 0) continue

  let toca = false
  const nuevasVars = vars.map((fila) => {
    const nueva = { ...fila }
    if (fila.prod_anterior_qq !== undefined && nueva.prod_anterior === undefined) {
      nueva.prod_anterior = fila.prod_anterior_qq
      toca = true
    }
    if (fila.prod_actual_qq !== undefined && nueva.prod_actual === undefined) {
      nueva.prod_actual = fila.prod_actual_qq
      toca = true
    }
    if (nueva.unidad_prod === undefined && fila.variedad) {
      const u = unidadDe(fila.variedad)
      if (u) {
        nueva.unidad_prod = u
        toca = true
      } else {
        ambiguas.push({ ficha: f.id, variedad: fila.variedad })
      }
    }
    return nueva
  })

  if (toca) cambios.push({ id: f.id, respuestas: { ...r, variedades: nuevasVars }, antes: vars, despues: nuevasVars })
}

console.log(`Fichas a migrar: ${cambios.length}`)
for (const c of cambios) {
  console.log(`\n  ${c.id.slice(0, 8)}`)
  for (let i = 0; i < c.despues.length; i++) {
    console.log(`    "${c.antes[i]?.variedad ?? ''}" -> prod_anterior=${c.despues[i].prod_anterior} prod_actual=${c.despues[i].prod_actual} unidad_prod=${c.despues[i].unidad_prod ?? '(sin asignar)'}`)
  }
}
if (ambiguas.length) {
  console.log(`\n⚠ Filas sin unidad asignada (revisar a mano): ${ambiguas.length}`)
  for (const a of ambiguas) console.log(`   ficha ${a.ficha.slice(0, 8)} · variedad="${a.variedad}"`)
}

if (!COMMIT) { console.log('\n(SIMULACIÓN) corre con --commit para aplicar.'); process.exit(0) }

let ok = 0
for (const c of cambios) {
  const { error: uErr } = await admin.from('fichas').update({ respuestas: c.respuestas }).eq('id', c.id)
  if (uErr) console.log('  ERROR', c.id, uErr.message)
  else ok++
}
console.log(`\nHecho. Fichas migradas: ${ok}`)
