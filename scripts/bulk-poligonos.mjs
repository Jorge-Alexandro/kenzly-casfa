// Carga masiva de polígonos (café Robusta) a las parcelas de la app.
// Fuente: scripts/_poligonos.json (generado del shapefile 47672 ...ROBUSTA).
// Empareja cada polígono con la parcela del mismo productor cuya área declarada
// sea más parecida (asignación 1:1 por cercanía de área).
//
// Uso:
//   node scripts/bulk-poligonos.mjs            -> SIMULACIÓN (solo escribe el plan)
//   node scripts/bulk-poligonos.mjs --commit   -> inserta los polígonos vía RPC
//
// Seguro: no toca parcelas que ya tienen polígono (salvo --overwrite).
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

const COMMIT = process.argv.includes('--commit')
const OVERWRITE = process.argv.includes('--overwrite')

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const polys = JSON.parse(readFileSync('scripts/_poligonos.json', 'utf8'))

// --- Cargar app: productores, parcelas, polígonos ya existentes ---
const { data: prod } = await admin.from('productores').select('id, codigo, nombre_completo')
const { data: parc } = await admin
  .from('parcelas')
  .select('id, productor_id, codigo_parcela, nombre, superficie_declarada_ha')
const { data: existentes } = await admin
  .from('parcela_poligonos')
  .select('parcela_id')
  .eq('activo', true)

const prodByCode = Object.fromEntries(prod.map((p) => [p.codigo, p]))
const parcByProd = {}
for (const pa of parc) (parcByProd[pa.productor_id] ??= []).push(pa)
const conPoligono = new Set((existentes ?? []).map((e) => e.parcela_id))

// --- Agrupar polígonos por productor ---
const polysByProd = {}
for (const p of polys) (polysByProd[p.id_interno] ??= []).push(p)

// Asignación 1:1 por cercanía de área (iterativo: par más cercano primero).
function asignar(polList, parcList) {
  const pairs = []
  for (const pl of polList)
    for (const pa of parcList)
      if (pa.superficie_declarada_ha != null)
        pairs.push({ pl, pa, d: Math.abs(pa.superficie_declarada_ha - pl.superficie) })
  pairs.sort((a, b) => a.d - b.d)
  const usadosPol = new Set(), usadasParc = new Set(), asign = []
  for (const { pl, pa, d } of pairs) {
    if (usadosPol.has(pl.id_de_un) || usadasParc.has(pa.id)) continue
    usadosPol.add(pl.id_de_un); usadasParc.add(pa.id)
    asign.push({ pl, pa, d })
  }
  // parcelas sin área declarada: asignar por orden a polígonos restantes
  const polRest = polList.filter((pl) => !usadosPol.has(pl.id_de_un))
  const parcRest = parcList.filter((pa) => !usadasParc.has(pa.id))
  for (let i = 0; i < Math.min(polRest.length, parcRest.length); i++)
    asign.push({ pl: polRest[i], pa: parcRest[i], d: null })
  const polSobran = polList.filter((pl) => !asign.find((a) => a.pl.id_de_un === pl.id_de_un))
  return { asign, polSobran }
}

const plan = []
let sinProductor = 0, fragmentos = 0
for (const [idInterno, polList] of Object.entries(polysByProd)) {
  const productor = prodByCode[idInterno]
  if (!productor) {
    sinProductor += polList.length
    for (const pl of polList)
      plan.push({ id_interno: idInterno, productor: '(NO EN APP)', id_de_un: pl.id_de_un,
        superficie_shp: pl.superficie.toFixed(3), parcela: '', area_parcela: '', dif: '', accion: 'OMITIR (productor no existe)' })
    continue
  }
  const parcList = parcByProd[productor.id] ?? []
  const { asign, polSobran } = asignar(polList, parcList)
  for (const { pl, pa, d } of asign) {
    const ya = conPoligono.has(pa.id)
    const accion = ya && !OVERWRITE ? 'OMITIR (ya tiene polígono)' : 'CARGAR'
    plan.push({ id_interno: idInterno, productor: productor.nombre_completo, id_de_un: pl.id_de_un,
      superficie_shp: pl.superficie.toFixed(3), parcela: pa.nombre || pa.codigo_parcela,
      area_parcela: pa.superficie_declarada_ha != null ? pa.superficie_declarada_ha.toFixed(2) : '?',
      dif: d != null ? d.toFixed(3) : '(sin área)', accion, _parcela_id: pa.id, _coords: pl.coordinates })
  }
  for (const pl of polSobran) {
    fragmentos++
    plan.push({ id_interno: idInterno, productor: productor.nombre_completo, id_de_un: pl.id_de_un,
      superficie_shp: pl.superficie.toFixed(3), parcela: '', area_parcela: '', dif: '',
      accion: 'SIN ASIGNAR (más polígonos que parcelas)' })
  }
}

// --- Escribir plan CSV ---
const cols = ['id_interno','productor','id_de_un','superficie_shp','parcela','area_parcela','dif','accion']
const csv = [cols.join(',')]
for (const r of plan)
  csv.push(cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))
writeFileSync('scripts/_plan_carga.csv', '﻿' + csv.join('\n'))

const cargar = plan.filter((r) => r.accion === 'CARGAR')
console.log('=== RESUMEN ===')
console.log('Polígonos totales:', polys.length)
console.log('A CARGAR (parcela emparejada):', cargar.length)
console.log('Omitidos por productor inexistente:', sinProductor)
console.log('Omitidos por ya tener polígono:', plan.filter((r) => r.accion.startsWith('OMITIR (ya')).length)
console.log('Sin asignar (fragmentos):', fragmentos)
console.log('Plan detallado -> scripts/_plan_carga.csv')

if (!COMMIT) {
  console.log('\n(SIMULACIÓN) No se insertó nada. Revisa el plan y corre con --commit para cargar.')
  process.exit(0)
}

// --- COMMIT: insertar vía RPC ---
console.log('\n=== CARGANDO ===')
let ok = 0, err = 0
for (const r of cargar) {
  const geojson = { type: 'Polygon', coordinates: r._coords }
  const { error } = await admin.rpc('upsert_parcela_poligono', {
    p_parcela_id: r._parcela_id,
    p_geojson: geojson,
    p_archivo_url: null,
    p_es_kmz: false,
    p_metodo: 'qgis',
  })
  if (error) { err++; console.log('  ERROR', r.id_de_un, '->', r.parcela, ':', error.message) }
  else { ok++; if (ok % 20 === 0) console.log('  ...', ok, 'cargados') }
}
console.log(`\nHecho. Cargados: ${ok}  Errores: ${err}`)
