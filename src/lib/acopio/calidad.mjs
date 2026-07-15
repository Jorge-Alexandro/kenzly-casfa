// Acopio — análisis de calidad de la muestra (Doc R.3 "Procedimiento para
// Muestreo y Acopio", CASFA 2025).
//
// El almacenista NO calcula porcentajes: pesa gramos. Este motor hace lo que
// hoy hace la tabla impresa del manual.
//
//   MUESTRA HOMOGENEIZADA (300 g)
//     ├─ se trilla en la morteadora → café ORO  ⇒ rendimiento = oro_g / 300
//     └─ se escoge a la vista el cerezo/negros  ⇒ cerezo     = cerezo_g / 300
//
//   100 g DE CAFÉ ORO ya retrillado
//     └─ se reparten en cuatro montones:  zaranda 16 · zaranda 15 · caracol ·
//        mancha    ⇒ cada uno / 100
//
// De ahí sale el invariante que confirma el método:
//     zaranda_16 + zaranda_15 + caracol + mancha = 1
// porque las cuatro categorías se reparten los MISMOS 100 g.
//
// DOS CASOS EN LOS QUE NO HAY RENDIMIENTO — y no son lo mismo:
//
//   · CAFÉ ORO: no se acopió en pergamino ni en cereza, entró ya trillado. No
//     hay conversión que medir. Sí se le hacen zarandas, mancha y humedad.
//   · CACAO: no lleva análisis de calidad, punto. Sólo humedad. (En las 40
//     entradas de cacao de CASFA.xlsx no hay una sola zaranda ni mancha.)
//
// En ambos el rendimiento es NULL = "no aplica", NO 100 %. AppSheet los guardaba
// como 1.0 y eso miente: dice "rendimiento perfecto" donde no se midió nada.
//
// Todo se devuelve en FRACCIÓN (0.8013), que es como lo guarda la base.
// Sin dependencias: `node` lo corre tal cual (scripts/verify-calidad.mjs).

export const MUESTRA_G_DEFAULT = 300 // muestra homogeneizada
export const ANALISIS_G_DEFAULT = 100 // base del análisis sobre café oro

const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v))
const red = (n, d) => Math.round(n * 10 ** d) / 10 ** d
const frac = (g, base) => (base > 0 ? red(num(g) / base, 4) : null)

/**
 * ¿Aplica el rendimiento? No, si el producto no se acopió en pergamino/cereza:
 * el café ORO ya entró trillado y el cacao no lleva análisis.
 */
export function aplicaRendimiento(especie, tipo) {
  return tipo !== 'ORO' && especie !== 'CACAO'
}

/** El cacao sólo lleva humedad: ni trilla, ni zarandas, ni mancha, ni cerezo. */
export function soloHumedad(especie) {
  return especie === 'CACAO'
}

/**
 * Convierte los gramos de la muestra en las fracciones que guarda la entrada.
 *
 * @param captura gramos pesados en la báscula + humedad del hidrómetro (en
 *                PUNTOS: 12.5 = 12.5 %, que es como la lee el aparato).
 * @param cfg     normas y bases del producto (tabla acopio_producto).
 */
export function calcularCalidad(captura = {}, cfg = {}) {
  const muestraG = num(cfg.muestra_g) || MUESTRA_G_DEFAULT
  const analisisG = num(cfg.analisis_g) || ANALISIS_G_DEFAULT
  // Por compatibilidad se acepta `trillado` (nombre viejo) como "no aplica".
  const conRendimiento = cfg.rendimiento_aplica ?? cfg.trillado !== true

  // Rendimiento: oro obtenido sobre la muestra. Si el café entró ya en oro (o es
  // cacao), no se acopió en pergamino/cereza: no hay nada que pesar → null.
  const rendimiento =
    !conRendimiento || captura.oro_g == null || captura.oro_g === ''
      ? null
      : frac(captura.oro_g, muestraG)

  const cerezo =
    !conRendimiento || captura.cerezo_g == null || captura.cerezo_g === ''
      ? null
      : frac(captura.cerezo_g, muestraG)

  // Tamaño y defectos: los cuatro montones de los 100 g de oro.
  const montones = ['zaranda_16', 'zaranda_15', 'caracol', 'mancha']
  const out = { rendimiento, cerezo }
  let capturados = 0
  let sumaG = 0
  for (const k of montones) {
    const g = captura[`${k}_g`]
    if (g == null || g === '') {
      out[k] = null
      continue
    }
    capturados++
    sumaG += num(g)
    out[k] = frac(g, analisisG)
  }

  // Humedad: la da el hidrómetro directo, no se calcula.
  out.humedad =
    captura.humedad == null || captura.humedad === ''
      ? null
      : red(num(captura.humedad) / 100, 4)

  out.suma_analisis_g = capturados > 0 ? red(sumaG, 2) : null
  out.analisis_g = capturados > 0 ? analisisG : null
  out.muestra_g = conRendimiento ? muestraG : null
  out.avisos = avisosCalidad(out, cfg, { capturados, sumaG, analisisG })
  return out
}

/**
 * Compara el resultado con las normas de recepción del producto (Doc R.3 §3).
 * Devuelve texto para el capturista; NO bloquea: rechazar el café es decisión
 * del almacenista, no de la app.
 */
function avisosCalidad(r, cfg, { capturados, sumaG, analisisG }) {
  const av = []
  const pct = (f) => `${red(f * 100, 2)} %`

  // El reparto de los 100 g tiene que cuadrar: si no, se pesó mal.
  if (capturados === 4 && Math.abs(sumaG - analisisG) > 0.5) {
    av.push(
      `Zaranda 16 + zaranda 15 + caracol + mancha suman ${red(sumaG, 2)} g y deben sumar ` +
        `${analisisG} g (se reparten la misma muestra de oro). Revisa el pesado.`,
    )
  }

  if (r.rendimiento != null && cfg.rend_min != null && r.rendimiento < cfg.rend_min) {
    av.push(`Rendimiento ${pct(r.rendimiento)} — por debajo del mínimo de ${pct(cfg.rend_min)}.`)
  }
  if (r.mancha != null && cfg.mancha_max != null && r.mancha > cfg.mancha_max) {
    av.push(`Mancha ${pct(r.mancha)} — arriba del máximo de ${pct(cfg.mancha_max)}. No se acepta.`)
  }
  if (r.cerezo != null && cfg.cerezo_max != null && r.cerezo > cfg.cerezo_max) {
    av.push(`Cerezo ${pct(r.cerezo)} — arriba de la tolerancia de ${pct(cfg.cerezo_max)}.`)
  }
  if (r.humedad != null && cfg.humedad_max != null && r.humedad > cfg.humedad_max) {
    av.push(`Humedad ${pct(r.humedad)} — arriba del máximo de ${pct(cfg.humedad_max)}.`)
  }
  if (r.humedad != null && cfg.humedad_min != null && r.humedad < cfg.humedad_min) {
    av.push(`Humedad ${pct(r.humedad)} — por debajo del mínimo de ${pct(cfg.humedad_min)}.`)
  }
  if (r.zaranda_16 != null && cfg.zaranda16_min != null && r.zaranda_16 < cfg.zaranda16_min) {
    av.push(`Zaranda 16 ${pct(r.zaranda_16)} — por debajo del ${pct(cfg.zaranda16_min)} de norma.`)
  }
  return av
}

/**
 * Camino inverso: de las fracciones guardadas a los gramos que se pesaron.
 * Lo usa la pantalla al abrir una entrada vieja (las 311 importadas de AppSheet
 * traen sólo fracciones) para poder mostrarlas en el formulario de gramos.
 */
export function gramosDesdeFracciones(e = {}, cfg = {}) {
  const muestraG = num(e.muestra_g) || num(cfg.muestra_g) || MUESTRA_G_DEFAULT
  const analisisG = num(e.analisis_g) || num(cfg.analisis_g) || ANALISIS_G_DEFAULT
  const conRendimiento = cfg.rendimiento_aplica ?? cfg.trillado !== true
  const g = (f, base) => (f == null ? null : red(Number(f) * base, 2))
  return {
    oro_g: conRendimiento ? g(e.rendimiento, muestraG) : null,
    cerezo_g: conRendimiento ? g(e.cerezo, muestraG) : null,
    zaranda_16_g: g(e.zaranda_16, analisisG),
    zaranda_15_g: g(e.zaranda_15, analisisG),
    caracol_g: g(e.caracol, analisisG),
    mancha_g: g(e.mancha, analisisG),
    humedad: e.humedad == null ? null : red(Number(e.humedad) * 100, 2),
  }
}
