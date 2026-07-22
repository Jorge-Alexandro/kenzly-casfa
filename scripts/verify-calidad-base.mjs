// Verifica que la BASE del análisis sea el ORO OBTENIDO, contra las tarjetas
// reales de CASFA (boletas 313 y 317, fotos del análisis de calidad).
//   node scripts/verify-calidad-base.mjs
import { calcularCalidad, gramosDesdeFracciones } from '../src/lib/acopio/calidad.mjs'

const CASOS = [
  {
    boleta: 313, producto: 'ARABE PERGAMINO',
    cfg: { muestra_g: 300, analisis_g: 100, rendimiento_aplica: true, rend_min: 0.81, mancha_max: 0.12 },
    // gramos tal como vienen en la tarjeta
    captura: { oro_g: 237, zaranda_16_g: 179, zaranda_15_g: 14, caracol_g: 11, mancha_g: 33, humedad: 13.5 },
    // porcentajes impresos en la boleta
    esperado: { rendimiento: 0.79, zaranda_16: 0.7552, zaranda_15: 0.059, caracol: 0.0466, mancha: 0.1392, humedad: 0.135 },
  },
  {
    boleta: 317, producto: 'ROBUSTA CEREZO',
    cfg: { muestra_g: 300, analisis_g: 100, rendimiento_aplica: true, rend_min: 0.6, mancha_max: 0.16 },
    captura: { oro_g: 177, zaranda_16_g: 99.3, zaranda_15_g: 18.4, caracol_g: 26.3, mancha_g: 33, humedad: 13 },
    esperado: { rendimiento: 0.59, zaranda_16: 0.561, zaranda_15: 0.1039, caracol: 0.1487, mancha: 0.1864, humedad: 0.13 },
  },
]

const TOL = 0.0005 // medio punto porcentual de redondeo de la tarjeta
let fallas = 0

for (const c of CASOS) {
  const r = calcularCalidad(c.captura, c.cfg)
  console.log(`\nBoleta ${c.boleta} — ${c.producto}`)
  console.log(`  base del análisis: ${r.analisis_g} g   (oro obtenido)`)
  console.log(`  suma de los 4    : ${r.suma_analisis_g} g`)
  for (const [k, esp] of Object.entries(c.esperado)) {
    const got = r[k]
    const ok = got != null && Math.abs(got - esp) <= TOL
    if (!ok) fallas++
    console.log(
      `  ${ok ? 'OK  ' : 'FALLA'} ${k.padEnd(11)} motor ${((got ?? 0) * 100).toFixed(2)}%  boleta ${(esp * 100).toFixed(2)}%`,
    )
  }
  // el reparto debe cuadrar con el oro
  const cuadra = Math.abs((r.suma_analisis_g ?? 0) - (r.analisis_g ?? 0)) <= 0.5
  console.log(`  ${cuadra ? 'OK  ' : 'FALLA'} los 4 montones suman el oro obtenido`)
  if (!cuadra) fallas++

  // viaje redondo: fracción → gramos → debe devolver los gramos originales
  const g = gramosDesdeFracciones({ ...c.esperado, muestra_g: 300 }, c.cfg)
  const rt = ['oro_g', 'zaranda_16_g', 'zaranda_15_g', 'caracol_g', 'mancha_g']
    .map((k) => `${k}=${g[k]}`)
    .join(' ')
  console.log(`  ida y vuelta     : ${rt}`)
}

console.log(fallas === 0 ? '\nTODO CORRECTO' : `\n${fallas} FALLAS`)
process.exit(fallas === 0 ? 0 : 1)
