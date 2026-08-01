// Los controles de plagas/enfermedades/hierbas del historial pasan de texto
// libre a casillas (checkbox), como en el formato original de CASFA. Esto
// convierte lo YA capturado (texto) al nuevo formato (arreglo de opciones) por
// coincidencia de palabra clave — no se inventa nada: si el texto no coincide
// con ninguna opción reconocida, se deja tal cual (como texto suelto dentro
// del arreglo) para no perder el dato, y se imprime para revisión manual.
//
// Uso:
//   node scripts/migrar-historial-controles.mjs           -> SIMULACIÓN
//   node scripts/migrar-historial-controles.mjs --commit  -> aplica
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const COMMIT = process.argv.includes('--commit')
const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

// campo -> [ [regex, opción canónica], ... ]
const REGLAS = {
  control_plagas_broca: [
    [/brocad/i, 'Pepena granos brocados'],
    [/insumo/i, 'Aplicó insumos'],
  ],
  control_enfermedades: [
    [/sombra/i, 'Regulando la sombra'],
    [/insumo/i, 'Aplicó insumos'],
  ],
  control_hierbas: [
    [/machete/i, 'Manual con machete'],
    [/insumo/i, 'Aplicó insumos'],
  ],
}

function convertir(campo, texto) {
  const reglas = REGLAS[campo]
  const marcadas = reglas.filter(([rx]) => rx.test(texto)).map(([, opcion]) => opcion)
  // Si ninguna palabra clave coincidió, no se inventa nada: se conserva el
  // texto completo tal cual, como único elemento del arreglo.
  return marcadas.length > 0 ? marcadas : [texto.trim()]
}

const { data, error } = await admin.from('historial_manejo_anual').select('id, parcela_id, anio, datos')
if (error) { console.log('ERROR leyendo:', error.message); process.exit(1) }

const CAMPOS = Object.keys(REGLAS)
const cambios = []
for (const h of data ?? []) {
  const d = h.datos ?? {}
  let toca = false
  const nuevo = { ...d }
  for (const campo of CAMPOS) {
    const v = d[campo]
    if (typeof v === 'string' && v.trim()) {
      nuevo[campo] = convertir(campo, v)
      toca = true
    }
  }
  if (toca) cambios.push({ id: h.id, parcela_id: h.parcela_id, anio: h.anio, antes: d, despues: nuevo })
}

console.log(`Filas a migrar: ${cambios.length}`)
for (const c of cambios) {
  console.log(`\n  ${c.parcela_id.slice(0, 8)} · ${c.anio}`)
  for (const campo of CAMPOS) {
    if (c.antes[campo] !== c.despues[campo]) {
      console.log(`    ${campo}: ${JSON.stringify(c.antes[campo])} -> ${JSON.stringify(c.despues[campo])}`)
    }
  }
}

if (!COMMIT) { console.log('\n(SIMULACIÓN) corre con --commit para aplicar.'); process.exit(0) }

let ok = 0
for (const c of cambios) {
  const { error: uErr } = await admin.from('historial_manejo_anual').update({ datos: c.despues }).eq('id', c.id)
  if (uErr) console.log('  ERROR', c.id, uErr.message)
  else ok++
}
console.log(`\nHecho. Filas migradas: ${ok}`)
