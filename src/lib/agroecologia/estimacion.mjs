// ============================================================================
// Kenzly CASFA — Motor de ESTIMACIÓN DE COSECHA (café y cacao). Fuente única.
// ----------------------------------------------------------------------------
// Digitaliza las dos boletas de CASFA ("Estimación de cosecha de café" y
// "…de cacao"). Su salida alimenta DOS destinos por igual:
//   - el LPA (columnas de producción kg/QQ/TM/rendimiento por cultivo), y
//   - los inventarios/KPIs del programa de Agroecología.
//
// Config (IM del cacao, factores de café, constante) NO se clava aquí: entra
// por parámetro desde el catálogo (tabla estimacion_regla). Defaults = valores
// de las boletas 2021-2022 de CASFA.
//
// Formato .mjs (verificable con `node` pelón). Tipos en estimacion.d.mts.
// ============================================================================

// --- Defaults de las boletas de CASFA -------------------------------------
// Un QUINTAL es invariante: 45.35 kg oro = 80 kg cereza seca (robusta)
// = 57.5 kg pergamino (árabe). La boleta calcula un número de quintales (QQ)
// que NO depende de la base; sólo los KG cambian según la forma física del
// cultivo. Por eso la salida canónica es `qq` y `kg = qq × kgPorQuintal`.
export const CACAO_IM_DEFAULT = 22;         // Índice de Mazorca (mazorcas por kg seco)
export const CACAO_MUESTRA_ARBOLES = 10;    // se muestrean 10 árboles productivos
export const CAFE_CONSTANTE = 640000;       // valor constante de la fórmula de café
export const OQ_ORO_KG = 45.35;             // kg por quintal oro (base común / default)

// Tabla del "factor de categoría productiva" del café, por promedio de
// cerezo/bandola (frutos por bandola). Baja→51, Regular→100, Alta→162.
export const CAFE_FACTORES_DEFAULT = [
  { hasta: 35, factor: 51 },   // Baja: < 35 frutos/bandola
  { hasta: 75, factor: 100 },  // Regular: 36–75
  { hasta: Infinity, factor: 162 }, // Alta: > 76
];

export function redondear(n, d = 2) {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
}

// ---------------------------------------------------------------------------
// CACAO — boleta de mazorcas.
// Se muestrean árboles y se agrupan por nº de mazorcas; el promedio de
// mazorcas/árbol × total de árboles de la parcela = total de mazorcas (f);
// kg cacao seco = f / IM.
// ---------------------------------------------------------------------------
/**
 * @param {object} p
 *   p.muestras   Array<{ mazorcas:number, arboles:number }> — conteo de la muestra
 *                (mazorcas por árbol × cuántos árboles cayeron en ese grupo).
 *                Alternativa: p.promedio_mazorcas ya calculado.
 *   p.n_arboles  Nº total de árboles productivos de la parcela.
 * @param {object} [cfg]  { im }
 */
export function estimarCacao(p, cfg = {}) {
  const im = cfg.im ?? CACAO_IM_DEFAULT;
  const nArboles = num(p.n_arboles);

  let promedio;
  if (p.promedio_mazorcas != null) {
    promedio = num(p.promedio_mazorcas);
  } else {
    let mazorcas = 0;
    let arboles = 0;
    for (const m of p.muestras ?? []) {
      mazorcas += num(m.mazorcas) * num(m.arboles);
      arboles += num(m.arboles);
    }
    promedio = arboles > 0 ? mazorcas / arboles : 0;
  }

  const total_mazorcas = promedio * nArboles;               // (f)
  const kg_seco = im > 0 ? total_mazorcas / im : 0;

  return {
    promedio_mazorcas: redondear(promedio, 2),
    total_mazorcas: redondear(total_mazorcas, 2),
    kg_seco: redondear(kg_seco, 2),
    tm: redondear(kg_seco / 1000, 4),
  };
}

// ---------------------------------------------------------------------------
// CAFÉ — boleta de bandolas.
// El factor de carga productiva sale del promedio de cerezo/bandola; luego:
//   Producción (qq oro/ha) = promedio × factor × plantas/ha / 640000
// ---------------------------------------------------------------------------
/** Elige el factor de carga productiva según el promedio de cerezo/bandola. */
export function factorCafe(promedio, tabla = CAFE_FACTORES_DEFAULT) {
  const v = num(promedio);
  for (const escalon of tabla) {
    if (v <= escalon.hasta) return escalon.factor;
  }
  return tabla[tabla.length - 1]?.factor ?? 0;
}

/**
 * @param {object} p
 *   p.promedio_cerezo_bandola  promedio de cerezos por bandola (de la muestra).
 *   p.plantas_ha               nº de plantas por hectárea.
 *   p.superficie_ha            (opcional) ha de la parcela → total qq/kg.
 * @param {object} [cfg]  { factores, constante, kgPorQuintal }
 *   kgPorQuintal: kg por quintal de la BASE del cultivo (robusta cereza=80,
 *   árabe pergamino=57.5, oro=45.35). Default oro. El QQ NO depende de esto.
 */
export function estimarCafe(p, cfg = {}) {
  const factores = cfg.factores ?? CAFE_FACTORES_DEFAULT;
  const constante = cfg.constante ?? CAFE_CONSTANTE;
  const kgPorQuintal = cfg.kgPorQuintal ?? OQ_ORO_KG;

  const promedio = num(p.promedio_cerezo_bandola);
  const plantasHa = num(p.plantas_ha);
  const factor = factorCafe(promedio, factores);

  const qq_ha = constante > 0
    ? (promedio * factor * plantasHa) / constante
    : 0;

  const out = {
    factor,
    qq_ha: redondear(qq_ha, 3),
  };

  // Si conocemos la superficie, escalamos a totales de la parcela.
  if (p.superficie_ha != null) {
    const ha = num(p.superficie_ha);
    const qq = qq_ha * ha;                    // quintales (invariante de base)
    const kg = qq * kgPorQuintal;             // kg en la base del cultivo
    out.superficie_ha = ha;
    out.qq = redondear(qq, 3);
    out.kg = redondear(kg, 2);
    out.tm = redondear(kg / 1000, 4);
  }
  return out;
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
