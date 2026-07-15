// Seed de las ventas REALES Ene–Abr 2026 desde el Excel
// "Reporte de ventas 2026 - ENE ABR.xlsx" (CASFA SIC FILES), ya saneado a
// scripts/data/ventas-2026.json:
//   - layout de la matriz confirmado contra los totales mensuales del propio
//     reporte (Ene 519,821.00 / Feb 650,299.05 / Mar 784,484.00 /
//     Abr 550,775.68 — cuadra al centavo);
//   - los desfases de captura del Excel (cantidades huérfanas / totales
//     tecleados en columnas de mes) se emparejaron usando la columna
//     "Procesados" como árbitro.
//
// Inserta: catálogo completo de productos (70, con línea de negocio y
// kg_por_unidad parseado del nombre), un cliente genérico "PÚBLICO EN GENERAL"
// (el Excel no trae clientes) y 52 ventas_detalle con origen='historico'
// (no descuentan stock, no tienen factura). Fecha = día 15 de cada mes.
//
// Idempotente: borra los detalles 'historico' del año antes de reinsertar.
// Requiere la migración 0018_ventas.sql aplicada.
//
// Uso: node scripts/seed-ventas-2026.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const { anio, productos, ventas } = JSON.parse(
  readFileSync(new URL('./data/ventas-2026.json', import.meta.url), 'utf8'),
)

const { data: org, error: orgErr } = await admin
  .from('organizaciones')
  .select('id')
  .eq('slug', 'casfa')
  .single()
if (orgErr || !org) {
  console.error('No se encontró la org casfa:', orgErr?.message)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. Cliente genérico (el reporte Excel no identifica compradores).
// ---------------------------------------------------------------------------
const { data: cliente, error: cliErr } = await admin
  .from('ventas_cliente')
  .upsert(
    {
      org_id: org.id,
      rfc: 'XAXX010101000', // RFC genérico del SAT para público en general
      nombre: 'PÚBLICO EN GENERAL (HISTÓRICO REPORTE EXCEL)',
    },
    { onConflict: 'org_id,rfc' },
  )
  .select('id')
  .single()
if (cliErr) {
  console.error('Error creando cliente genérico:', cliErr.message)
  console.error('¿Ya corriste la migración 0018_ventas.sql en el SQL Editor?')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 2. Catálogo de productos (upsert por nombre; línea y kg_por_unidad mandan
//    desde el Excel saneado).
// ---------------------------------------------------------------------------
const { data: prodRows, error: prodErr } = await admin
  .from('ventas_producto')
  .upsert(
    productos.map((p) => ({ org_id: org.id, ...p })),
    { onConflict: 'org_id,nombre' },
  )
  .select('id, nombre')
if (prodErr) {
  console.error('Error sembrando productos:', prodErr.message)
  process.exit(1)
}
const idPorNombre = new Map(prodRows.map((p) => [p.nombre, p.id]))
console.log(`Productos en catálogo: ${prodRows.length}`)

// ---------------------------------------------------------------------------
// 3. Ventas: limpiar histórico del año y reinsertar.
// ---------------------------------------------------------------------------
const { error: delErr } = await admin
  .from('ventas_detalle')
  .delete()
  .eq('org_id', org.id)
  .eq('origen', 'historico')
  .gte('fecha', `${anio}-01-01`)
  .lte('fecha', `${anio}-12-31`)
if (delErr) {
  console.error('Error limpiando histórico previo:', delErr.message)
  process.exit(1)
}

const filas = ventas.map((v) => ({
  org_id: org.id,
  factura_id: null,
  producto_id: idPorNombre.get(v.nombre),
  cliente_id: cliente.id,
  cantidad: v.cantidad,
  precio_unitario: v.cantidad > 0 ? Math.round((v.importe / v.cantidad) * 100) / 100 : 0,
  importe: v.importe,
  fecha: `${anio}-${String(v.mes).padStart(2, '0')}-15`,
  alerta_precio: false,
  origen: 'historico',
}))
const sinProducto = filas.filter((f) => !f.producto_id)
if (sinProducto.length) {
  console.error(`${sinProducto.length} ventas sin producto en catálogo — abortando`)
  process.exit(1)
}
const { error: insErr } = await admin.from('ventas_detalle').insert(filas)
if (insErr) {
  console.error('Error insertando ventas:', insErr.message)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 4. Verificación: totales por mes contra el reporte.
// ---------------------------------------------------------------------------
const ESPERADO = { 1: 519821.0, 2: 650299.05, 3: 784484.0, 4: 550775.68 }
const { data: check } = await admin
  .from('ventas_detalle')
  .select('fecha, importe')
  .eq('org_id', org.id)
  .eq('origen', 'historico')
  .gte('fecha', `${anio}-01-01`)
  .lte('fecha', `${anio}-12-31`)
const porMes = {}
for (const r of check ?? []) {
  const m = Number(r.fecha.slice(5, 7))
  porMes[m] = (porMes[m] ?? 0) + Number(r.importe)
}
let ok = true
for (const m of Object.keys(ESPERADO)) {
  const cuadra = Math.abs((porMes[m] ?? 0) - ESPERADO[m]) < 0.01
  if (!cuadra) ok = false
  console.log(`Mes ${m}: ${(porMes[m] ?? 0).toFixed(2)} vs ${ESPERADO[m].toFixed(2)} ${cuadra ? 'OK' : '≠≠≠'}`)
}
console.log(ok ? `\n${filas.length} ventas sembradas — todos los meses cuadran al centavo.` : '\nHAY DIFERENCIAS — revisar.')
process.exit(ok ? 0 : 1)
