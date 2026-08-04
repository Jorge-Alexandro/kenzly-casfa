// Reinicio a cero de fichas, bitácoras e historial — para pasar de la prueba
// piloto (CHESPAL) a producción real con folios empezando en 1.
//
// Borra TODAS las filas de fichas, bitacora_anual e historial_manejo_anual
// (y lo que cuelgue de una ficha: ficha_parcelas y la estimación de cosecha
// que esa ficha generó). NO toca GeoSIC: los polígonos ya medidos son datos
// geográficos reales de la parcela, no de la ficha, y no se piden en esta
// limpieza. Tampoco toca Asistencia, Acopio ni el resto de módulos.
//
// Uso:
//   node scripts/reiniciar-fichas-bitacora-historial.mjs           -> SIMULACIÓN
//   node scripts/reiniciar-fichas-bitacora-historial.mjs --commit  -> aplica
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const COMMIT = process.argv.includes('--commit')
const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const { data: org } = await admin.from('organizaciones').select('id').eq('slug', 'casfa').single()

const [{ count: cFichas }, { count: cBitacoras }, { count: cHistorial }, { count: cFichaParc }] = await Promise.all([
  admin.from('fichas').select('*', { count: 'exact', head: true }),
  admin.from('bitacora_anual').select('*', { count: 'exact', head: true }),
  admin.from('historial_manejo_anual').select('*', { count: 'exact', head: true }),
  admin.from('ficha_parcelas').select('*', { count: 'exact', head: true }),
])
const { data: estFichas } = await admin.from('estimacion_cosecha').select('id, muestra')
const estimacionesDeFicha = (estFichas ?? []).filter((e) => e.muestra?.origen === 'ficha')

console.log('Lo que se va a borrar:')
console.log(`  fichas                    ${cFichas}`)
console.log(`  ficha_parcelas (cascada)  ${cFichaParc}`)
console.log(`  bitacora_anual            ${cBitacoras}`)
console.log(`  historial_manejo_anual    ${cHistorial}`)
console.log(`  estimacion_cosecha (origen=ficha)  ${estimacionesDeFicha.length}`)
console.log('\nLo que NO se toca: parcela_poligonos (GeoSIC), asistencia, acopio, contratos, ventas, etc.')
console.log('Los contadores de folio (ficha_contador/bitacora_contador/historial_contador) se ponen en 0,')
console.log('así que la próxima ficha/bitácora/historial que se capture sale con folio #1.')

if (!COMMIT) {
  console.log('\n(SIMULACIÓN) corre con --commit para aplicar. Esto NO se puede deshacer.')
  process.exit(0)
}

// Orden: primero lo que no tiene cascada garantizada, luego fichas (que
// arrastra ficha_parcelas y las bitácoras ligadas por ficha_id).
if (estimacionesDeFicha.length) {
  const { error } = await admin.from('estimacion_cosecha').delete().in('id', estimacionesDeFicha.map((e) => e.id))
  if (error) console.log('  ERROR borrando estimacion_cosecha:', error.message)
}

const { error: eHist } = await admin.from('historial_manejo_anual').delete().eq('org_id', org.id)
if (eHist) console.log('  ERROR borrando historial:', eHist.message)

// Bitácoras SIN ficha (las ligadas por ficha_id ya caen solas al borrar la ficha).
const { error: eBit } = await admin.from('bitacora_anual').delete().is('ficha_id', null).eq('org_id', org.id)
if (eBit) console.log('  ERROR borrando bitácoras sueltas:', eBit.message)

const { error: eFichas } = await admin.from('fichas').delete().eq('org_id', org.id)
if (eFichas) console.log('  ERROR borrando fichas:', eFichas.message)

// Por si quedó alguna bitácora con ficha_id apuntando a algo ya borrado por
// otra vía (no debería, pero se confirma en vez de asumir).
const { error: eBit2 } = await admin.from('bitacora_anual').delete().eq('org_id', org.id)
if (eBit2) console.log('  ERROR borrando bitácoras restantes:', eBit2.message)

// Reiniciar folios a 0 (el trigger vuelve a arrancar en 1).
for (const tabla of ['ficha_contador', 'bitacora_contador', 'historial_contador']) {
  const { error } = await admin.from(tabla).update({ ultimo_folio: 0 }).eq('org_id', org.id)
  if (error) console.log(`  ERROR reiniciando ${tabla}:`, error.message)
}

const [{ count: f2 }, { count: b2 }, { count: h2 }] = await Promise.all([
  admin.from('fichas').select('*', { count: 'exact', head: true }),
  admin.from('bitacora_anual').select('*', { count: 'exact', head: true }),
  admin.from('historial_manejo_anual').select('*', { count: 'exact', head: true }),
])
console.log(`\nHecho. Quedan -> fichas: ${f2} · bitacora_anual: ${b2} · historial_manejo_anual: ${h2}`)
