// Importa el padrón de proveedores de ACOPIO desde el Excel de acopio.
// Fuente: hoja "Entrada", columnas Proveedor / Comunidad / Municipio.
// Requiere la migración 0032. Uso:
//   node scripts/import-acopio-proveedores.mjs           -> SIMULACIÓN
//   node scripts/import-acopio-proveedores.mjs --commit  -> escribe
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { leerXlsx } from '../src/lib/xlsx-read.mjs'

const COMMIT = process.argv.includes('--commit')
const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const XLSX = 'C:/Users/jorge/Documents/CASFA SIC FILES/CASFA ACOPIO CORTE AL DIA DE HOY.xlsx'
const wb = leerXlsx(readFileSync(XLSX))
const hoja = wb.hoja('Entrada')

// Cols: [2]Proveedor [3]Comunidad [4]Municipio
const porNombre = new Map()
for (let r = 1; r < hoja.length; r++) {
  const f = hoja[r] ?? []
  const nombre = String(f[2] ?? '').trim()
  if (!nombre) continue
  if (!porNombre.has(nombre)) {
    porNombre.set(nombre, {
      nombre,
      comunidad: String(f[3] ?? '').trim() || null,
      municipio: String(f[4] ?? '').trim() || null,
    })
  }
}
const proveedores = [...porNombre.values()]
console.log('Proveedores distintos en el Excel:', proveedores.length)
proveedores.slice(0, 8).forEach((p) => console.log('  ·', p.nombre, '|', p.comunidad, '/', p.municipio))

if (!COMMIT) { console.log('\n(SIMULACIÓN) corre con --commit para importar.'); process.exit(0) }

const { data: org } = await admin.from('organizaciones').select('id').eq('slug', 'casfa').single()
const filas = proveedores.map((p) => ({ org_id: org.id, ...p }))
let esc = 0
for (let i = 0; i < filas.length; i += 200) {
  const { error } = await admin.from('acopio_proveedor').upsert(filas.slice(i, i + 200), { onConflict: 'org_id,nombre' })
  if (error) { console.log('ERROR', error.message); break }
  esc += filas.slice(i, i + 200).length
}
console.log(`\nHecho. Proveedores en el padrón de acopio: ${esc}`)
