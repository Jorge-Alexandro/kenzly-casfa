// Diag 3: ¿la tabla membresias/organizaciones es legible por anon/authenticated?
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const url = get('NEXT_PUBLIC_SUPABASE_URL')
const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

const c = createClient(url, anon, { auth: { persistSession: false } })

// Con anon (sin login): si RLS está OFF y hay grant, devuelve filas.
// Si RLS está ON sin policy, devuelve [] (0 filas) sin error.
// Si falta el grant, devuelve error 'permission denied'.
for (const tabla of ['membresias', 'organizaciones', 'usuarios']) {
  const { data, error } = await c.from(tabla).select('*').limit(5)
  console.log(
    `${tabla}: ${error ? 'ERROR ' + error.code + ' ' + error.message : (data.length + ' filas')}`,
  )
}
