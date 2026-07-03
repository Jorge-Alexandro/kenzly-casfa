// Crea (o actualiza) un usuario de la app con su rol en CASFA, en un solo paso:
//   1. credencial en auth.users (email + contraseña, ya confirmada)
//   2. perfil en la tabla usuarios
//   3. membresía en CASFA con el rol elegido
//
// Uso:
//   node scripts/crear-usuario.mjs <email> "<Nombre>" <rol> [contraseña]
//
// Roles válidos: admin | coordinador | inspector | solo_lectura
// Si no das contraseña, se genera una y se imprime al final.
//
// Ejemplos:
//   node scripts/crear-usuario.mjs maria@casfa.org "María López" inspector
//   node scripts/crear-usuario.mjs juan@casfa.org "Juan Pérez" coordinador Cafe2026!
//
// Vuelve a correrlo con el mismo email para CAMBIAR el rol o la contraseña.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const ROLES = ['admin', 'coordinador', 'inspector', 'solo_lectura']

const [email, nombre, rol, passwordArg] = process.argv.slice(2)

if (!email || !nombre || !rol) {
  console.error('Uso: node scripts/crear-usuario.mjs <email> "<Nombre>" <rol> [contraseña]')
  console.error('Roles: ' + ROLES.join(' | '))
  process.exit(1)
}
if (!ROLES.includes(rol)) {
  console.error(`Rol inválido "${rol}". Usa uno de: ${ROLES.join(' | ')}`)
  process.exit(1)
}

// Contraseña: la dada, o una generada legible.
const password =
  passwordArg ||
  'Casfa-' + Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 89)

async function buscarAuthUser(correo) {
  // Busca en auth.users paginando (orgs chicas: pocas páginas).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find((x) => x.email?.toLowerCase() === correo.toLowerCase())
    if (u) return u
    if (data.users.length < 200) break
  }
  return null
}

async function main() {
  const { data: org, error: orgErr } = await admin
    .from('organizaciones')
    .select('id, nombre')
    .eq('slug', 'casfa')
    .single()
  if (orgErr) throw orgErr

  // 1) Credencial (auth.users): crear o reutilizar si ya existe.
  let uid
  let creado = false
  const existente = await buscarAuthUser(email)
  if (existente) {
    uid = existente.id
    // Si pasaste contraseña, la actualiza; si no, se conserva la actual.
    if (passwordArg) {
      const { error } = await admin.auth.admin.updateUserById(uid, { password })
      if (error) throw error
    }
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // puede entrar de inmediato, sin correo de confirmación
    })
    if (error) throw error
    uid = data.user.id
    creado = true
  }

  // 2) Perfil (usuarios)
  const { error: uErr } = await admin
    .from('usuarios')
    .upsert({ id: uid, email, nombre }, { onConflict: 'id' })
  if (uErr) throw uErr

  // 3) Membresía con el rol
  const { error: mErr } = await admin
    .from('membresias')
    .upsert({ org_id: org.id, usuario_id: uid, rol }, { onConflict: 'org_id,usuario_id' })
  if (mErr) throw mErr

  console.log('\n✓ Usuario listo en ' + org.nombre)
  console.log('  Nombre : ' + nombre)
  console.log('  Email  : ' + email)
  console.log('  Rol    : ' + rol)
  console.log('  Estado : ' + (creado ? 'CREADO' : 'actualizado (ya existía)'))
  if (creado || passwordArg) {
    console.log('  Contraseña: ' + password)
    console.log('\n  Comparte email + contraseña con la persona. Puede entrar en:')
    console.log('  https://kenzly-casfa.vercel.app/login')
  } else {
    console.log('  (Se conservó su contraseña actual; para cambiarla, pásala como 4º argumento.)')
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message ?? e)
  process.exit(1)
})
