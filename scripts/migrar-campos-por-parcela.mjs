// Colindancias / amortiguamiento pasan a preguntarse POR PARCELA: sus
// respuestas cambian de clave plana (`colinda_norte`) a clave por parcela
// (`colinda_norte::<parcelaId>`).
//
// Las fichas de UNA parcela no cambian (con una sola parcela la clave sigue
// plana). Las de varias sí: lo que el inspector contestó una vez para toda la
// ficha se copia a cada parcela, para que no desaparezca del informe. A partir
// de ahí puede corregir predio por predio.
//
// Uso:
//   node scripts/migrar-campos-por-parcela.mjs           -> SIMULACIÓN
//   node scripts/migrar-campos-por-parcela.mjs --commit  -> aplica
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const COMMIT = process.argv.includes('--commit')
const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const CLAVES = [
  'colinda_norte', 'colinda_sur', 'colinda_este', 'colinda_oeste',
  'areas_amortiguamento', 'areas_amortiguamiento',
  'amortiguamiento_metros', 'amortiguamiento_especie',
  'contaminacion_riesgo', 'riesgo_cultivos_colindantes',
]

const { data: fichas } = await admin
  .from('fichas')
  .select('id, tipo, estado, respuestas, ficha_parcelas ( parcela_id )')

const tocadas = []
for (const f of fichas ?? []) {
  const parcelas = (f.ficha_parcelas ?? []).map((p) => p.parcela_id)
  if (parcelas.length < 2) continue // con una parcela la clave sigue siendo plana
  const r = f.respuestas ?? {}
  const conValor = CLAVES.filter((k) => r[k] !== undefined && r[k] !== null && r[k] !== '')
  if (conValor.length === 0) continue

  const nuevas = { ...r }
  for (const k of conValor) {
    for (const pid of parcelas) {
      // No pisar lo que ya se haya capturado por parcela.
      if (nuevas[`${k}::${pid}`] === undefined) nuevas[`${k}::${pid}`] = r[k]
    }
  }
  tocadas.push({ id: f.id, estado: f.estado, parcelas: parcelas.length, campos: conValor, nuevas })
}

console.log(`Fichas a migrar: ${tocadas.length}`)
for (const t of tocadas) {
  console.log(`   · ${t.id.slice(0, 8)} · ${t.estado} · ${t.parcelas} parcelas · ${t.campos.join(', ')}`)
}

if (!COMMIT) {
  console.log('\n(SIMULACIÓN) corre con --commit para aplicar.')
  process.exit(0)
}

let ok = 0
for (const t of tocadas) {
  const { error } = await admin.from('fichas').update({ respuestas: t.nuevas }).eq('id', t.id)
  if (error) console.log('  ERROR', t.id, error.message)
  else ok++
}
console.log(`\nHecho. Fichas migradas: ${ok}`)
