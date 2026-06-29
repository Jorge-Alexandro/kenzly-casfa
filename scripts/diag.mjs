// Diagnóstico rápido: verifica usuario auth, perfil y membresía.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Cargar .env.local manualmente
const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()

const url = get('NEXT_PUBLIC_SUPABASE_URL')
const service = get('SUPABASE_SERVICE_ROLE_KEY')
const admin = createClient(url, service, { auth: { persistSession: false } })

const { data: authUsers } = await admin.auth.admin.listUsers()
console.log('\n=== auth.users ===')
for (const u of authUsers.users) console.log(u.id, u.email, 'confirmed:', !!u.email_confirmed_at)

const { data: usuarios } = await admin.from('usuarios').select('*')
console.log('\n=== usuarios ===')
console.log(usuarios)

const { data: orgs } = await admin.from('organizaciones').select('*')
console.log('\n=== organizaciones ===')
console.log(orgs)

const { data: membresias } = await admin.from('membresias').select('*')
console.log('\n=== membresias ===')
console.log(membresias)

// ¿Existen las RPC?
const { error: rpcErr } = await admin.rpc('get_parcelas_geo')
console.log('\n=== RPC get_parcelas_geo existe? ===')
console.log(rpcErr ? 'ERROR: ' + rpcErr.message : 'OK')
