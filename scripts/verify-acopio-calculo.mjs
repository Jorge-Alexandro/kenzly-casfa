// ============================================================================
// Verifica lib/acopio/calculo.mjs contra filas REALES de CASFA.xlsx.
// Correr:  node scripts/verify-acopio-calculo.mjs
// (Node 20+, sin dependencias. En este equipo node no está en PATH:
//   $env:PATH = "C:\Program Files\nodejs;" + $env:PATH   antes de correrlo.)
// ============================================================================
import assert from 'node:assert/strict';
import {
  calcularPesada,
  validarPesada,
  totalizarEntrada,
  redondear,
} from '../src/lib/acopio/calculo.mjs';

const FACTOR = { PERGAMINO: 57.5, ORO: 45.35, CEREZO: 80.0, CACAO: null };

// Filas reales (sacos y kgs modelados en la máquina 1; el split no altera la
// aritmética). El conteo de costales se deriva de la tara conocida del archivo.
const CASOS = [
  { n: 'Pergamino 550 sacos (plástico)', tipo: 'PERGAMINO',
    in: { m1_sacos: 550, m1_kgs: 27679.5, plastico: 550 },
    esp: { sacos_total: 550, kg_brutos: 27679.5, tara_kg: 165, kg_netos: 27514.5, quintales: 478.51 } },
  { n: 'Oro 50 sacos (yute)', tipo: 'ORO',
    in: { m1_sacos: 50, m1_kgs: 3485.5, yute: 50 },
    esp: { sacos_total: 50, kg_brutos: 3485.5, tara_kg: 50, kg_netos: 3435.5, quintales: 75.76 } },
  { n: 'Cerezo 11 sacos (plástico)', tipo: 'CEREZO',
    in: { m1_sacos: 11, m1_kgs: 762, plastico: 11 },
    esp: { sacos_total: 11, kg_brutos: 762, tara_kg: 3.3, kg_netos: 758.7, quintales: 9.48 } },
  { n: 'Pergamino 100 sacos (plástico)', tipo: 'PERGAMINO',
    in: { m1_sacos: 100, m1_kgs: 5686.2, plastico: 100 },
    esp: { sacos_total: 100, kg_brutos: 5686.2, tara_kg: 30, kg_netos: 5656.2, quintales: 98.37 } },
  { n: 'Cacao 1 saco (plástico) — quintal N/A', tipo: 'CACAO',
    in: { m1_sacos: 1, m1_kgs: 70.2, plastico: 1 },
    esp: { sacos_total: 1, kg_brutos: 70.2, tara_kg: 0.3, kg_netos: 69.9, quintales: null } },
];

let ok = 0;
for (const c of CASOS) {
  const d = calcularPesada(c.in, { factorQuintal: FACTOR[c.tipo] });
  for (const [k, v] of Object.entries(c.esp)) {
    if (v === null) assert.equal(d[k], null, `${c.n}: ${k} debe ser null`);
    else assert.ok(Math.abs(d[k] - v) <= 0.01, `${c.n}: ${k} = ${d[k]}, esperado ${v}`);
  }
  console.log(`  ✓ ${c.n}`);
  ok++;
}

// Henequén (no hay fila limpia en el archivo): 10 costales × 1.30 = 13.0
{
  const d = calcularPesada({ m1_sacos: 10, m1_kgs: 700, henequen: 10 }, { factorQuintal: null });
  assert.equal(d.tara_kg, 13.0, 'henequén 10×1.30 = 13.0');
  console.log('  ✓ Henequén 10 costales → tara 13.0');
  ok++;
}

// Validación: la tara no puede superar los brutos.
{
  const r = validarPesada({ m1_sacos: 1, m1_kgs: 0.5, plastico: 5 }); // tara 1.5 > 0.5
  assert.equal(r.ok, false, 'debe rechazar tara > brutos');
  console.log('  ✓ Rechaza tara > brutos');
  ok++;
}

// Totales de entrada = suma de pesadas (§9).
{
  const p1 = calcularPesada({ m1_sacos: 300, m1_kgs: 15000, plastico: 300 }, { factorQuintal: 57.5 });
  const p2 = calcularPesada({ m1_sacos: 250, m1_kgs: 12679.5, plastico: 250 }, { factorQuintal: 57.5 });
  const t = totalizarEntrada([
    { ...p1, plastico: 300 }, { ...p2, plastico: 250 },
  ]);
  assert.equal(t.total_sacos, 550, 'suma sacos');
  assert.equal(t.kg_brutos, 27679.5, 'suma brutos');
  assert.equal(t.plastico, 550, 'suma plástico');
  assert.equal(redondear(t.kg_netos), redondear(p1.kg_netos + p2.kg_netos), 'suma netos');
  console.log('  ✓ Totales de entrada = suma de pesadas');
  ok++;
}

console.log(`\n${ok} verificaciones OK — motor de cálculo conforme a CASFA.xlsx.`);
