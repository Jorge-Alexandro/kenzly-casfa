// Bajas del ciclo 2026-2027, confirmadas por el SIC de CASFA.
//
//  1) Tres productores robusteros salen del programa. NO se borran: se registra
//     la baja en productor_baja, que es lo que alimenta la hoja de bajas del LPA
//     y el contador del panel. Un productor borrado se llevaría por delante sus
//     inspecciones y su historial de certificación.
//
//  2) Yolanda Sonia Pérez Rosalez (CR015011) vendió el predio "La Cuchilla 1"
//     (1.5 ha) y se queda solo con "La Cuchilla" (3.5 ha). La parcela vendida ya
//     no es suya, así que se elimina — se verificó antes que no tiene polígono,
//     fichas, bitácora, historial, estimación ni verificación EUDR colgando. La
//     baja de superficie (5 → 3.5 ha) queda asentada en reduccion_superficie,
//     que es la 3ª hoja del LPA.
//
// Uso:
//   node scripts/bajas-lpa-2026.mjs           -> SIMULACIÓN
//   node scripts/bajas-lpa-2026.mjs --commit  -> aplica
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const COMMIT = process.argv.includes('--commit')
const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const MOTIVO = 'Baja confirmada por el SIC; no aparece en el LPA 2026-2027'
const BAJAS = ['CR015075', 'CR103078', 'CR015090']
const PARCELA_VENDIDA = 'CR015011La Cuchilla 1'
const CICLO_ANT = '2025-2026'
const CICLO_ACT = '2026-2027'

const { data: org } = await admin.from('organizaciones').select('id').eq('slug', 'casfa').single()

// --- 1) Bajas de productor ---------------------------------------------------
const { data: prods } = await admin
  .from('productores')
  .select('id, codigo, nombre_completo')
  .in('codigo', BAJAS)
const { data: niveles } = await admin
  .from('certificacion_estatus')
  .select('productor_id, anio, nivel')
  .order('anio', { ascending: false })
const nivelDe = new Map()
for (const n of niveles ?? []) if (!nivelDe.has(n.productor_id)) nivelDe.set(n.productor_id, n)

const { data: yaBaja } = await admin.from('productor_baja').select('productor_id')
const conBaja = new Set((yaBaja ?? []).map((b) => b.productor_id))

console.log('BAJAS DE PRODUCTOR')
for (const p of prods ?? []) {
  const n = nivelDe.get(p.id)
  const { count: parc } = await admin
    .from('parcelas')
    .select('*', { count: 'exact', head: true })
    .eq('productor_id', p.id)
  console.log(
    `   ${conBaja.has(p.id) ? '=' : '+'} ${p.codigo} · ${p.nombre_completo} · ${parc} parcela(s)` +
      ` · nivel al darse de baja: ${n?.nivel ?? '—'}${conBaja.has(p.id) ? '  (ya registrada)' : ''}`,
  )
}
const faltan = BAJAS.filter((c) => !(prods ?? []).some((p) => p.codigo === c))
if (faltan.length) console.log('   ⚠ no encontrados:', faltan.join(', '))

// --- 2) Parcela vendida de Yolanda -------------------------------------------
const { data: parcela } = await admin
  .from('parcelas')
  .select('id, productor_id, codigo_parcela, nombre, superficie_declarada_ha')
  .eq('codigo_parcela', PARCELA_VENDIDA)
  .maybeSingle()

console.log('\nPARCELA VENDIDA')
if (!parcela) {
  console.log('   (ya no existe — nada que hacer)')
} else {
  const { data: hermanas } = await admin
    .from('parcelas')
    .select('codigo_parcela, superficie_declarada_ha')
    .eq('productor_id', parcela.productor_id)
  const haAntes = hermanas.reduce((s, p) => s + (Number(p.superficie_declarada_ha) || 0), 0)
  const haDespues = haAntes - Number(parcela.superficie_declarada_ha || 0)
  console.log(`   − ${parcela.codigo_parcela} "${parcela.nombre}" ${parcela.superficie_declarada_ha} ha`)
  console.log(`   queda: ${hermanas.filter((h) => h.codigo_parcela !== PARCELA_VENDIDA).map((h) => `${h.codigo_parcela} ${h.superficie_declarada_ha} ha`).join(', ')}`)
  console.log(`   reducción de superficie: ${haAntes} → ${haDespues} ha (redujo ${haAntes - haDespues})`)

  if (!COMMIT) {
    // Última verificación de seguridad antes de permitir el borrado.
    const refs = ['ficha_parcelas', 'parcela_poligonos', 'bitacora_anual', 'historial_manejo_anual', 'estimacion_cosecha', 'parcela_eudr', 'parcela_indices_satelitales']
    const usos = []
    for (const t of refs) {
      const r = await admin.from(t).select('*', { count: 'exact', head: true }).eq('parcela_id', parcela.id)
      if (!r.error && r.count) usos.push(`${t}:${r.count}`)
    }
    console.log(`   referencias que se perderían: ${usos.length ? usos.join(', ') + '  ⚠ REVISAR' : 'ninguna'}`)
  }
}

if (!COMMIT) {
  console.log('\n(SIMULACIÓN) corre con --commit para aplicar.')
  process.exit(0)
}

// --- Aplicar -----------------------------------------------------------------
let okB = 0
for (const p of prods ?? []) {
  const n = nivelDe.get(p.id)
  const { error } = await admin.from('productor_baja').upsert(
    {
      org_id: org.id,
      productor_id: p.id,
      tipo: 'voluntaria',
      motivo: MOTIVO,
      anio: 2026,
      nivel_al_baja: n?.nivel ?? null,
    },
    { onConflict: 'productor_id' },
  )
  if (error) console.log('  ERROR baja', p.codigo, error.message)
  else okB++
}

let okR = 0
let okP = 0
if (parcela) {
  const { data: hermanas } = await admin
    .from('parcelas')
    .select('superficie_declarada_ha')
    .eq('productor_id', parcela.productor_id)
  const haAntes = hermanas.reduce((s, p) => s + (Number(p.superficie_declarada_ha) || 0), 0)
  const haDespues = haAntes - Number(parcela.superficie_declarada_ha || 0)

  // Primero se asienta la reducción: si el borrado fallara, el registro de por
  // qué bajó la superficie ya quedó.
  const { error: rErr } = await admin.from('reduccion_superficie').upsert(
    {
      org_id: org.id,
      productor_id: parcela.productor_id,
      ciclo_anterior: CICLO_ANT,
      ciclo_actual: CICLO_ACT,
      ha_anterior: haAntes,
      ha_actual: haDespues,
      redujo: haAntes - haDespues,
    },
    { onConflict: 'productor_id' },
  )
  if (rErr) console.log('  ERROR reduccion:', rErr.message)
  else okR = 1

  const { error: dErr } = await admin.from('parcelas').delete().eq('id', parcela.id)
  if (dErr) console.log('  ERROR borrar parcela:', dErr.message)
  else okP = 1
}

console.log(`\nHecho. Bajas registradas: ${okB} · reducción de superficie: ${okR} · parcela vendida eliminada: ${okP}`)
