// Diagnóstico 2: estado de RLS y prueba de getSession bajo rol authenticated.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()

const url = get('NEXT_PUBLIC_SUPABASE_URL')
const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const service = get('SUPABASE_SERVICE_ROLE_KEY')
const admin = createClient(url, service, { auth: { persistSession: false } })

// Estado RLS de las tablas de fundación
const { data: rls, error: rlsErr } = await admin.rpc('exec_sql_diag').catch(() => ({ data: null, error: 'no rpc' }))

// Query directa a pg_class via SQL no es posible por RPC; usamos una funcion inline:
const { data, error } = await admin
  .from('pg_tables')
  .select('*')
  .eq('schemaname', 'public')
  .in('tablename', ['membresias', 'organizaciones', 'usuarios'])
console.log('pg_tables:', error ? error.message : data?.map(t => t.tablename))

// Prueba real: firmar como el usuario con el anon key.
// Necesitamos password — lo pedimos por variable de entorno DIAG_PW.
const pw = process.env.DIAG_PW
if (!pw) {
  console.log('\n>> Define DIAG_PW con la contraseña del usuario para probar getSession bajo authenticated.')
} else {
  const userClient = createClient(url, anon, { auth: { persistSession: false } })
  const { data: signIn, error: signErr } = await userClient.auth.signInWithPassword({
    email: 'jaab210905@gmail.com',
    password: pw,
  })
  if (signErr) {
    console.log('signIn error:', signErr.message)
  } else {
    console.log('\nsignIn OK, uid:', signIn.user.id)
    const { data: m, error: mErr } = await userClient
      .from('membresias')
      .select('rol, org_id, organizaciones ( id, nombre, slug )')
      .limit(1)
      .maybeSingle()
    console.log('membresias (authenticated):', mErr ? 'ERROR: ' + mErr.message : m)
  }
}
