// ============================================================================
// Verifica el motor de estimación de cosecha contra las fórmulas de las boletas
// de CASFA. Correr:  node scripts/verify-estimacion.mjs
//   $env:PATH = "C:\Program Files\nodejs;" + $env:PATH
// ============================================================================
import assert from 'node:assert/strict';
import {
  estimarCacao,
  estimarCafe,
  factorCafe,
  CACAO_IM_DEFAULT,
} from '../src/lib/agroecologia/estimacion.mjs';

const cerca = (a, b, t = 0.01) => Math.abs(a - b) <= t;
let ok = 0;

// --- CACAO: kg seco = (promedio × nº árboles) / IM(22) --------------------
{
  // promedio 22 mazorcas/árbol × 1000 árboles = 22000 mazorcas / 22 = 1000 kg
  const r = estimarCacao({ promedio_mazorcas: 22, n_arboles: 1000 });
  assert.ok(cerca(r.total_mazorcas, 22000), 'cacao total mazorcas');
  assert.ok(cerca(r.kg_seco, 1000), `cacao kg_seco = ${r.kg_seco}`);
  console.log('  ✓ Cacao: promedio 22 × 1000 árboles ÷ IM22 = 1000 kg');
  ok++;
}
{
  // Muestra en grupos: (10×2 + 20×5 + 30×3) / (2+5+3) = (20+100+90)/10 = 21
  const r = estimarCacao(
    { muestras: [ { mazorcas: 10, arboles: 2 }, { mazorcas: 20, arboles: 5 }, { mazorcas: 30, arboles: 3 } ], n_arboles: 500 },
    { im: CACAO_IM_DEFAULT },
  );
  assert.ok(cerca(r.promedio_mazorcas, 21), `cacao promedio muestra = ${r.promedio_mazorcas}`);
  assert.ok(cerca(r.kg_seco, (21 * 500) / 22), 'cacao kg desde muestra');
  console.log('  ✓ Cacao: promedio ponderado de la muestra (21) → kg seco');
  ok++;
}

// --- CAFÉ: factor por categoría productiva --------------------------------
{
  assert.equal(factorCafe(30), 51, 'Baja → 51');
  assert.equal(factorCafe(50), 100, 'Regular → 100');
  assert.equal(factorCafe(120), 162, 'Alta → 162');
  console.log('  ✓ Café: factor 51/100/162 por promedio cerezo/bandola');
  ok++;
}

// --- CAFÉ: producción = promedio × factor × plantas/ha ÷ 640000 -----------
{
  // promedio 50 (→factor 100), 2000 plantas/ha: 50×100×2000/640000 = 15.625 qq/ha
  const r = estimarCafe({ promedio_cerezo_bandola: 50, plantas_ha: 2000 });
  assert.equal(r.factor, 100, 'café factor 100');
  assert.ok(cerca(r.qq_ha, 15.625, 0.001), `café qq/ha = ${r.qq_ha}`);
  console.log('  ✓ Café: 50 × 100 × 2000 ÷ 640000 = 15.625 qq/ha');
  ok++;
}
{
  // El QQ es invariante de base; los KG cambian según el cultivo.
  // Robusta (cereza, 80): 31.25 qq × 80 = 2500 kg cereza. QQ igual = 31.25.
  const rob = estimarCafe(
    { promedio_cerezo_bandola: 50, plantas_ha: 2000, superficie_ha: 2 },
    { kgPorQuintal: 80 },
  );
  assert.ok(cerca(rob.qq, 31.25, 0.01), `café qq total = ${rob.qq}`);
  assert.ok(cerca(rob.kg, 31.25 * 80, 0.5), `robusta kg cereza = ${rob.kg}`);
  // Árabe (pergamino, 57.5): mismo QQ, kg = 31.25 × 57.5.
  const ara = estimarCafe(
    { promedio_cerezo_bandola: 50, plantas_ha: 2000, superficie_ha: 2 },
    { kgPorQuintal: 57.5 },
  );
  assert.ok(cerca(ara.qq, rob.qq, 0.001), 'QQ igual entre robusta y árabe');
  assert.ok(cerca(ara.kg, 31.25 * 57.5, 0.5), `árabe kg pergamino = ${ara.kg}`);
  console.log('  ✓ Café: QQ invariante; KG por base (robusta ×80, árabe ×57.5)');
  ok++;
}

console.log(`\n${ok} verificaciones OK — estimación conforme a las boletas de CASFA.`);
