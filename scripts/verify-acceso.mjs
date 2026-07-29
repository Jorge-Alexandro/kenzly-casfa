// Verifica la matriz de acceso por rol (src/lib/acceso.ts) contra la regla que
// tenía el nav ANTES de centralizarla, para confirmar que nadie ganó ni perdió
// módulos al mover la decisión a un solo lugar.
//   antes:  admin=todo · contador=los marcados contador · resto=los no-soloAdmin
import { puedeVerModulo, moduloDeRuta, moduloInicial } from '../src/lib/acceso.ts'

// Los flags que tenía AppHeader antes del cambio.
const TABS_VIEJOS = [
  ['/panel', { contador: true }],
  ['/geosic', {}],
  ['/satelite', {}],
  ['/productores', {}],
  ['/certificacion', {}],
  ['/lpa', {}],
  ['/certificados', {}],
  ['/acopio', { soloAdmin: true, contador: true }],
  ['/salidas', { soloAdmin: true, contador: true }],
  ['/contabilidad', { soloAdmin: true, contador: true }],
  ['/gastos', { soloAdmin: true, contador: true }],
  ['/concentrado', { soloAdmin: true, contador: true }],
  ['/ventas', { soloAdmin: true, contador: true }],
  ['/contratos', { soloAdmin: true }],
  ['/crm', { soloAdmin: true, contador: true }],
  ['/estimacion', {}],
  ['/agroecologia', { soloAdmin: true }],
  ['/fichas', {}],
  ['/bitacora', {}],
  ['/historial', {}],
  ['/asistencia', {}],
]

function veiaAntes(rol, flags) {
  if (rol === 'admin') return true
  if (rol === 'contador') return flags.contador === true
  return !flags.soloAdmin
}

let fallas = 0
for (const rol of ['admin', 'coordinador', 'inspector', 'solo_lectura', 'contador']) {
  const dif = []
  for (const [href, flags] of TABS_VIEJOS) {
    const antes = veiaAntes(rol, flags)
    const ahora = puedeVerModulo(rol, moduloDeRuta(href))
    if (antes !== ahora) dif.push(`${href} (antes ${antes ? 'sí' : 'no'} → ahora ${ahora ? 'sí' : 'no'})`)
  }
  if (dif.length) {
    fallas += dif.length
    console.log(`✗ ${rol}: ${dif.length} cambio(s) —`, dif.join(', '))
  } else {
    console.log(`✓ ${rol}: sin cambios`)
  }
}

// El rol nuevo: SOLO acopio y salidas.
const esperado = ['acopio', 'salidas']
const ve = TABS_VIEJOS.map(([h]) => moduloDeRuta(h)).filter((m) => puedeVerModulo('operativo', m))
const ok = ve.length === esperado.length && esperado.every((m) => ve.includes(m))
console.log(`${ok ? '✓' : '✗'} operativo ve: ${ve.join(', ')} (esperado: ${esperado.join(', ')})`)
if (!ok) fallas++

// Módulos de dinero que operativo NO debe alcanzar.
const dinero = ['contabilidad', 'gastos', 'concentrado', 'ventas', 'contratos', 'crm']
const fuga = dinero.filter((m) => puedeVerModulo('operativo', m))
console.log(`${fuga.length === 0 ? '✓' : '✗'} operativo bloqueado en dinero${fuga.length ? ': FUGA en ' + fuga.join(', ') : ''}`)
if (fuga.length) fallas++

console.log(`\noperativo entra por: ${moduloInicial('operativo')}`)
console.log(fallas === 0 ? '\nTODO OK' : `\n${fallas} PROBLEMA(S)`)
process.exit(fallas === 0 ? 0 : 1)
