// ============================================================================
// Verifica los cálculos puros del CRM (valor ponderado, resumen de pipeline,
// vencimientos y seguimiento). Correr:  node scripts/verify-crm.mjs
//   $env:PATH = "C:\Program Files\nodejs;" + $env:PATH
// ============================================================================
import assert from 'node:assert/strict';
import {
  valorPonderado,
  resumenPipeline,
  esAbierta,
  actividadVencida,
  actividadProxima,
  cierreVencido,
  cierreProximo,
  sinSeguimiento,
} from '../src/lib/crm/calculos.mjs';

let ok = 0;

// --- valor ponderado = monto × probabilidad/100 ----------------------------
{
  assert.equal(valorPonderado(100000, 80), 80000);
  assert.equal(valorPonderado(0, 50), 0);
  assert.equal(valorPonderado(33333.33, 50), 16666.67); // redondeo a centavos
  assert.equal(valorPonderado('abc', 50), 0); // entrada basura → 0, no NaN
  console.log('  ✓ valorPonderado: 100k × 80% = 80k, redondeo y basura');
  ok++;
}

// --- resumen de pipeline ----------------------------------------------------
{
  const opps = [
    { etapa: 'nuevo', monto_estimado: 1000, probabilidad: 10 },
    { etapa: 'negociacion', monto_estimado: 5000, probabilidad: 80 },
    { etapa: 'ganado', monto_estimado: 9000, probabilidad: 100 },
    { etapa: 'perdido', monto_estimado: 2000, probabilidad: 0 },
  ];
  const r = resumenPipeline(opps);
  assert.equal(r.abiertas, 2); // ganado/perdido NO cuentan como abiertas
  assert.equal(r.totalAbierto, 6000);
  assert.equal(r.ponderado, 100 + 4000); // 1000×10% + 5000×80%
  assert.equal(r.porEtapa.ganado.n, 1);
  assert.equal(r.porEtapa.ganado.monto, 9000);
  console.log('  ✓ resumenPipeline: abiertas=2, total=6000, ponderado=4100');
  ok++;
}

// --- etapas abiertas vs cerradas --------------------------------------------
{
  assert.ok(esAbierta('cotizacion'));
  assert.ok(!esAbierta('ganado'));
  assert.ok(!esAbierta('perdido'));
  console.log('  ✓ esAbierta: cotización sí; ganado/perdido no');
  ok++;
}

// --- actividades: vencida / próxima ------------------------------------------
{
  const ahora = new Date('2026-07-13T12:00:00Z');
  const vencida = { completada_at: null, fecha_programada: '2026-07-10T09:00:00Z' };
  const completada = { completada_at: '2026-07-11T09:00:00Z', fecha_programada: '2026-07-10T09:00:00Z' };
  const futura = { completada_at: null, fecha_programada: '2026-07-15T09:00:00Z' };
  const lejana = { completada_at: null, fecha_programada: '2026-09-01T09:00:00Z' };
  assert.ok(actividadVencida(vencida, ahora));
  assert.ok(!actividadVencida(completada, ahora)); // completada nunca vence
  assert.ok(!actividadVencida(futura, ahora));
  assert.ok(actividadProxima(futura, ahora, 7));
  assert.ok(!actividadProxima(lejana, ahora, 7));
  assert.ok(!actividadProxima(vencida, ahora, 7)); // vencida no es "próxima"
  console.log('  ✓ actividadVencida/actividadProxima: pendiente+pasada vence; completada no');
  ok++;
}

// --- cierre de oportunidad: vencido / próximo --------------------------------
{
  const hoy = new Date('2026-07-13T12:00:00Z');
  const vencida = { etapa: 'negociacion', fecha_cierre_estimada: '2026-07-01' };
  const proxima = { etapa: 'cotizacion', fecha_cierre_estimada: '2026-07-20' };
  const ganada = { etapa: 'ganado', fecha_cierre_estimada: '2026-07-01' };
  const sinFecha = { etapa: 'nuevo', fecha_cierre_estimada: null };
  assert.ok(cierreVencido(vencida, hoy));
  assert.ok(!cierreVencido(ganada, hoy)); // cerrada: la advertencia ya no aplica
  assert.ok(!cierreVencido(sinFecha, hoy));
  assert.ok(cierreProximo(proxima, hoy, 14));
  assert.ok(!cierreProximo(vencida, hoy, 14)); // vencida no es "próxima"
  console.log('  ✓ cierreVencido/cierreProximo: solo etapas abiertas con fecha');
  ok++;
}

// --- sin seguimiento (14 días sin updated_at ni actividad) --------------------
{
  const ahora = new Date('2026-07-13T12:00:00Z');
  const vieja = { etapa: 'contactado', updated_at: '2026-06-01T00:00:00Z' };
  assert.ok(sinSeguimiento(vieja, null, ahora, 14));
  // una actividad reciente en la cuenta la rescata
  assert.ok(!sinSeguimiento(vieja, '2026-07-10T00:00:00Z', ahora, 14));
  // ganada/perdida no alertan
  assert.ok(!sinSeguimiento({ etapa: 'ganado', updated_at: '2026-01-01T00:00:00Z' }, null, ahora, 14));
  console.log('  ✓ sinSeguimiento: 14 días sin movimiento; actividad reciente rescata');
  ok++;
}

console.log(`\n${ok} grupos de verificación OK — cálculos del CRM consistentes.`);
