// Carga inicial de los formatos de acopio de la cosecha 2026 y VERIFICACIÓN
// del MASTER derivado contra el MASTER de Excel que hoy se llena a mano.
//
// Usa la misma ingesta que el API (lib/maquila/importar.mjs), pero con service
// role: la carga histórica no tiene sesión de usuario.
//
// Después de importar, lee la vista v_maquila_master y la compara corte por
// corte contra la hoja 'MASTER MAQUILAS' de 2026 MASTER MAQUILA.xlsx. Si los
// QQ no coinciden, el módulo está mal y hay que saberlo AQUÍ, no en producción.
//
// Requiere 0023_maquila.sql aplicada.
// Uso: node scripts/import-maquila.mjs [--solo-verificar]
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { createHash } from 'crypto'
import { importarArchivo } from '../src/lib/maquila/importar.mjs'
import { leerXlsx } from '../src/lib/xlsx-read.mjs'

const DIR = 'C:/Users/jorge/Documents/CASFA SIC FILES/FORMATOS DE RECORTE DE ACOPIO/'
const MASTER = '2026 MASTER MAQUILA.xlsx'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const soloVerificar = process.argv.includes('--solo-verificar')
const n = (x, d = 1) => Number(x ?? 0).toFixed(d)

const { data: org } = await admin.from('organizaciones').select('id').eq('slug', 'casfa').single()
if (!org) throw new Error('No existe la organización casfa')
console.log(`org casfa = ${org.id}\n`)

// ---------------------------------------------------------------------------
// 1. Importar
// ---------------------------------------------------------------------------
if (!soloVerificar) {
  // El MASTER va AL FINAL: su hoja SALIDA se enlaza con los cortes y los lotes,
  // que tienen que existir antes.
  const archivos = [
    ...readdirSync(DIR).filter(
      (f) => (f.startsWith('FORMATO') || f.startsWith('INVENTARIO')) && f.endsWith('.xlsx'),
    ),
    MASTER,
  ]

  for (const nombre of archivos) {
    const bytes = new Uint8Array(readFileSync(DIR + nombre))
    const hash = createHash('sha256').update(bytes).digest('hex')
    try {
      const r = await importarArchivo(admin, org.id, bytes, nombre, hash)
      const alerta = r.avisos.length ? `  ⚠ ${r.avisos.length} aviso(s)` : ''
      const linea =
        r.tipo === 'maquila'
          ? `✓ ${r.clave.padEnd(14)} ${r.resultados} productos · ${r.boletas} boletas ` +
            `(${r.boletasEnlazadas} enlazadas) · ${r.lotes} lotes`
          : r.tipo === 'inventario'
            ? `✓ inventario ${r.fecha} · ${r.lineas} renglones`
            : `✓ salidas: ${r.exportaciones} exportaciones + ${r.nacionales} nacionales · ` +
              `${r.enlazadasMaquila} enlazadas a un corte, ${r.enlazadasLote} a un lote`
      console.log(linea + alerta)
      for (const a of r.avisos) console.log(`    [${a.nivel}] ${a.mensaje}`)
    } catch (e) {
      console.log(`✗ ${nombre}: ${e.message}`)
    }
  }
  console.log()
}

// ---------------------------------------------------------------------------
// 2. Verificar la vista contra el MASTER de Excel
// ---------------------------------------------------------------------------
// La hoja 'MASTER MAQUILAS' apila 4 bloques (árabe pergamino, árabe oro,
// robusta oro, cerezo robusta). Cada fila de datos trae 'M-13' en la col B.
// Se cosechan todas las filas con esa forma, sin importar en qué bloque estén.
const wb = leerXlsx(readFileSync(DIR + MASTER))
const hoja = wb.hoja(wb.nombres.find((s) => s.trim().startsWith('MASTER')))

const excel = new Map()
for (const fila of hoja) {
  const clave = String(fila?.[1] ?? '').trim()
  if (!/^M-\d+$/.test(clave)) continue
  excel.set(clave, {
    kgEntrada: Number(fila[6] ?? 0),   // G: KGS NTS ENVIADO
    qqPrimeras: Number(fila[9] ?? 0),  // J: QQ ORO 1as
    qqSegundas: Number(fila[12] ?? 0), // M: QQ ORO 2as
    qqTerceras: Number(fila[15] ?? 0), // P: QQ ORO 3as
    qqTotal: Number(fila[19] ?? 0),    // T: QQ ORO total
  })
}

const { data: vista, error } = await admin
  .from('v_maquila_master')
  .select('clave, kg_entrada, qq_primeras, qq_segundas, qq_terceras, qq_salida')
  .eq('org_id', org.id)
if (error) throw new Error(error.message)

console.log('Verificación contra la hoja MASTER MAQUILAS del Excel')
console.log('='.repeat(78))
console.log(
  'CORTE'.padEnd(8) + 'KG ENTRADA'.padStart(14) + 'QQ 1as'.padStart(12) +
    'QQ 2as'.padStart(11) + 'QQ 3as'.padStart(10) + 'QQ TOTAL'.padStart(12) + '   ',
)

let ok = 0
const fallos = []
for (const v of vista.sort((a, b) => a.clave.localeCompare(b.clave, 'es', { numeric: true }))) {
  const e = excel.get(v.clave)
  if (!e) {
    console.log(`${v.clave.padEnd(8)} (no está en el MASTER de Excel — corte nuevo)`)
    continue
  }
  // Tolerancia de 0.5 QQ: el Excel arrastra redondeos de fórmulas encadenadas.
  const cmp = [
    [Number(v.kg_entrada), e.kgEntrada, 1],
    [Number(v.qq_primeras), e.qqPrimeras, 0.5],
    [Number(v.qq_segundas), e.qqSegundas, 0.5],
    [Number(v.qq_terceras), e.qqTerceras, 0.5],
    [Number(v.qq_salida), e.qqTotal, 0.5],
  ]
  const malos = cmp.filter(([a, b, tol]) => Math.abs(a - b) > tol)
  const marca = malos.length === 0 ? '✓' : '✗'
  if (malos.length === 0) ok++
  else fallos.push({ clave: v.clave, cmp })

  console.log(
    v.clave.padEnd(8) +
      n(v.kg_entrada, 1).padStart(14) +
      n(v.qq_primeras, 1).padStart(12) +
      n(v.qq_segundas, 1).padStart(11) +
      n(v.qq_terceras, 1).padStart(10) +
      n(v.qq_salida, 1).padStart(12) +
      `   ${marca}`,
  )
  if (malos.length > 0) {
    const et = ['kg entrada', 'QQ 1as', 'QQ 2as', 'QQ 3as', 'QQ total']
    for (const [a, b, tol] of malos) {
      const i = cmp.findIndex((c) => c[0] === a && c[1] === b)
      console.log(`         ${et[i]}: sistema ${n(a, 2)} vs Excel ${n(b, 2)}`)
    }
  }
}

console.log('='.repeat(78))
console.log(`${ok}/${vista.length} cortes coinciden con el MASTER de Excel.`)
if (fallos.length) console.log(`${fallos.length} con diferencias (arriba).`)
