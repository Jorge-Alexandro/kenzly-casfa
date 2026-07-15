// ============================================================================
// Kenzly CASFA — Motor de cálculo de pesadas (fuente ÚNICA de la verdad)
// ----------------------------------------------------------------------------
// Funciones puras, sin I/O. La app las usa en el cliente (previsualización en
// vivo + captura offline) y en el servidor (al persistir la pesada). El total
// de la ENTRADA lo recalcula el trigger SQL por suma; aquí sólo va la aritmética
// por pesada (§6–§7 del documento maestro), verificada contra CASFA.xlsx.
//
// Config (tara por material, factor de quintal por tipo) NO se clava aquí: se
// recibe como parámetro desde acopio_tara / acopio_producto. Así CASFA puede
// cambiar 0.30/1.00/1.30 o 57.5/45.35/80 sin tocar código.
//
// Se escribe en .mjs (no .ts) para poder verificarlo con `node` pelón, sin
// añadir tsx/vitest. Los tipos para la app viven en calculo.d.ts (mismo nombre).
// ============================================================================

/** Tara en kg por cada unidad de material de costal. Default = valores CASFA. */
export const TARA_DEFAULT = { plastico: 0.30, yute: 1.00, henequen: 1.30 };

/** Redondea a `d` decimales evitando el arrastre binario (12.005 -> 12.01). */
export function redondear(n, d = 2) {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/**
 * Calcula los derivados de una pesada.
 * @param {object} p               Captura cruda de la pesada.
 * @param {object} [cfg]           Config { tara, factorQuintal }.
 * @returns {object}               Derivados listos para persistir.
 */
export function calcularPesada(p, cfg = {}) {
  const tara = { ...TARA_DEFAULT, ...(cfg.tara ?? {}) };
  const factorQuintal = cfg.factorQuintal ?? null; // null/0 => no aplica (cacao)

  const m1Sacos = num(p.m1_sacos);
  const m2Sacos = num(p.m2_sacos);
  const m1Kgs = num(p.m1_kgs);
  const m2Kgs = num(p.m2_kgs);
  const plastico = num(p.plastico);
  const yute = num(p.yute);
  const henequen = num(p.henequen);

  const sacos_total = m1Sacos + m2Sacos;                       // §6.1
  const kg_brutos = redondear(m1Kgs + m2Kgs);                  // §6.2

  const desc_plastico = plastico * tara.plastico;              // §6.4
  const desc_yute = yute * tara.yute;                          // §6.5
  const desc_henequen = henequen * tara.henequen;              // §6.6
  const tara_kg = redondear(desc_plastico + desc_yute + desc_henequen); // §6.7

  const kg_netos = redondear(kg_brutos - tara_kg);             // §6.8

  // §7: quintales = netos / factor; cacao (factor null/0) => null (N/A, no 0)
  const quintales =
    factorQuintal && factorQuintal > 0 ? redondear(kg_netos / factorQuintal) : null;

  return {
    sacos_total,
    kg_brutos,
    desc_plastico: redondear(desc_plastico),
    desc_yute: redondear(desc_yute),
    desc_henequen: redondear(desc_henequen),
    tara_kg,
    kg_netos,
    quintales,
  };
}

/**
 * ¿La captura es válida? (§6.8: tara ≤ brutos, netos ≥ 0).
 * @returns {{ok: boolean, errores: string[]}}
 */
export function validarPesada(p, cfg = {}) {
  const d = calcularPesada(p, cfg);
  const errores = [];
  if (d.sacos_total <= 0) errores.push('La pesada no tiene sacos.');
  if (d.kg_brutos <= 0) errores.push('La pesada no tiene kilogramos brutos.');
  if (d.tara_kg > d.kg_brutos) errores.push('La tara supera los kilogramos brutos.');
  if (d.kg_netos < 0) errores.push('Los kilogramos netos serían negativos.');
  return { ok: errores.length === 0, errores };
}

/** Suma los derivados de varias pesadas → totales de la entrada (§9). */
export function totalizarEntrada(pesadas) {
  const t = {
    total_sacos: 0, kg_brutos: 0, tara_kg: 0, kg_netos: 0,
    plastico: 0, yute: 0, henequen: 0, quintales: null,
  };
  for (const p of pesadas) {
    t.total_sacos += num(p.sacos_total);
    t.kg_brutos += num(p.kg_brutos);
    t.tara_kg += num(p.tara_kg);
    t.kg_netos += num(p.kg_netos);
    t.plastico += num(p.plastico);
    t.yute += num(p.yute);
    t.henequen += num(p.henequen);
    if (p.quintales != null) t.quintales = num(t.quintales) + num(p.quintales);
  }
  for (const k of ['kg_brutos', 'tara_kg', 'kg_netos']) t[k] = redondear(t[k]);
  if (t.quintales != null) t.quintales = redondear(t.quintales);
  return t;
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
