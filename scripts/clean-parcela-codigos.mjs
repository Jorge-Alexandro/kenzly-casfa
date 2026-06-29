// Limpia codigo_parcela: la migración dejó "CODIGO" + "Nombre" concatenados
// (p.ej. "CR015007Los Rosales"). Recortamos el nombre del final para dejar solo
// el código ("CR015007"). Solo toca filas donde el código TERMINA con el nombre.
//
// Uso: node scripts/clean-parcela-codigos.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

const { data: parcelas, error } = await admin
  .from('parcelas')
  .select('id, codigo_parcela, nombre')
if (error) {
  console.error(error.message)
  process.exit(1)
}

let fixed = 0
let skipped = 0
for (const p of parcelas) {
  const codigo = (p.codigo_parcela ?? '').trim()
  const nombre = (p.nombre ?? '').trim()
  if (!nombre) {
    skipped++
    continue
  }
  // ¿El código termina con el nombre? (insensible a mayúsculas/espacios)
  if (norm(codigo).endsWith(norm(nombre))) {
    const limpio = codigo.slice(0, codigo.length - nombre.length).trim()
    if (limpio && limpio !== codigo) {
      const { error: upErr } = await admin
        .from('parcelas')
        .update({ codigo_parcela: limpio })
        .eq('id', p.id)
      if (upErr) {
        console.error(`! ${codigo}: ${upErr.message}`)
      } else {
        fixed++
      }
    } else {
      skipped++
    }
  } else {
    skipped++
  }
}

console.log(`Listo. Limpiados: ${fixed}, sin cambios: ${skipped}, total: ${parcelas.length}`)
