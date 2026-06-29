// Restaura codigo_parcela tras el intento fallido de limpieza: re-anexa el
// nombre a las filas cuyo código YA NO termina con el nombre (las ~30 mutadas).
// Original = codigo_corto + nombre (sin separador), p.ej. "CR015007"+"Los Rosales".
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const { data: parcelas, error } = await admin
  .from('parcelas')
  .select('id, codigo_parcela, nombre')
if (error) {
  console.error(error.message)
  process.exit(1)
}

let restored = 0
let ok = 0
for (const p of parcelas) {
  const codigo = (p.codigo_parcela ?? '').trim()
  const nombre = (p.nombre ?? '').trim()
  if (!nombre) {
    ok++
    continue
  }
  if (norm(codigo).endsWith(norm(nombre))) {
    ok++ // ya tiene el nombre: intacto
    continue
  }
  // No termina con el nombre -> fue recortado; restaurar.
  const original = codigo + nombre
  let intento = 0
  while (intento < 4) {
    const { error: upErr } = await admin
      .from('parcelas')
      .update({ codigo_parcela: original })
      .eq('id', p.id)
    if (!upErr) {
      restored++
      break
    }
    intento++
    await sleep(300)
    if (intento === 4) console.error(`! ${codigo}: ${upErr.message}`)
  }
  await sleep(60) // throttle suave para evitar fetch failed
}

console.log(`Restauradas: ${restored}, intactas: ${ok}, total: ${parcelas.length}`)
