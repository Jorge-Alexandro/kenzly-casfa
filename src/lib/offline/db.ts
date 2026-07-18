// Almacén local (IndexedDB) para captura offline en campo.
//   - 'catalogos': cachea plantillas, productores y parcelas para capturar sin red.
//   - 'outbox':    fichas capturadas offline, pendientes de sincronizar.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { FormTemplate, ProductorLite, ParcelaLite } from '@/lib/types'

// Una ficha encolada (lo mismo que el body de POST /api/fichas + metadatos).
export interface FichaPendiente {
  local_id: string // uuid local
  creada_en: number // timestamp
  body: {
    tipo: string
    template_id: string | null
    productor_id: string
    parcela_ids: string[]
    fecha_inspeccion: string | null
    respuestas: Record<string, unknown>
    estado: string
  }
  // etiqueta legible para la UI (productor/tipo)
  etiqueta: string
}

// Una remisión capturada en campo, pendiente de sincronizar.
// local_id lo genera el celular: es la llave de idempotencia contra la que el
// servidor hace upsert. En la sierra la red aparece y desaparece a media
// petición, y sin esto un reintento crearía la remisión dos veces.
export interface RemisionPendiente {
  local_id: string
  creada_en: number
  body: {
    local_id: string
    fecha_remision: string
    ciclo: string
    productor_id: string | null
    proveedor_nombre: string
    comunidad: string | null
    municipio: string | null
    especie: string
    tipo: string
    material_saco: string | null
    total_sacos: number
    kg_declarado: number | null
    observaciones: string | null
    lat: number | null
    lng: number | null
    /** Los códigos de las etiquetas escaneadas, en orden. */
    etiquetas: string[]
  }
  etiqueta: string // texto para la UI (productor · N sacos)
}

// Una bitácora capturada offline, pendiente de sincronizar (body de POST /api/bitacora).
export interface BitacoraPendiente {
  local_id: string
  creada_en: number
  body: {
    parcela_id: string
    anio: number
    datos: unknown
    ficha_id: string | null
  }
  etiqueta: string
}

// Un historial capturado offline, pendiente de sincronizar (body de POST /api/historial).
export interface HistorialPendiente {
  local_id: string
  creada_en: number
  body: {
    parcela_id: string
    anios: { anio: number; datos: unknown }[]
  }
  etiqueta: string
}

// Una edición de datos de catálogo (productor/parcela) capturada offline.
export interface EdicionPendiente {
  local_id: string
  creada_en: number
  tipo: 'productor' | 'parcela'
  id: string // id del productor o parcela a actualizar
  cambios: Record<string, unknown>
  etiqueta: string
}

interface KenzlyDB extends DBSchema {
  catalogos: {
    key: string
    value: unknown
  }
  outbox: {
    key: string
    value: FichaPendiente
  }
  remisiones: {
    key: string
    value: RemisionPendiente
  }
  bitacoras: {
    key: string
    value: BitacoraPendiente
  }
  historiales: {
    key: string
    value: HistorialPendiente
  }
  ediciones: {
    key: string
    value: EdicionPendiente
  }
}

const DB_NAME = 'kenzly-geosic'
const DB_VERSION = 4

let dbPromise: Promise<IDBPDatabase<KenzlyDB>> | null = null

function getDB() {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB solo está disponible en el navegador')
  }
  if (!dbPromise) {
    dbPromise = openDB<KenzlyDB>(DB_NAME, DB_VERSION, {
      // Sin `if (!contains)` esto borraría la cola de fichas de un promotor que
      // todavía no ha sincronizado. El upgrade corre en celulares con datos sin
      // enviar dentro.
      upgrade(db) {
        if (!db.objectStoreNames.contains('catalogos')) {
          db.createObjectStore('catalogos')
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'local_id' })
        }
        if (!db.objectStoreNames.contains('remisiones')) {
          db.createObjectStore('remisiones', { keyPath: 'local_id' })
        }
        if (!db.objectStoreNames.contains('bitacoras')) {
          db.createObjectStore('bitacoras', { keyPath: 'local_id' })
        }
        if (!db.objectStoreNames.contains('historiales')) {
          db.createObjectStore('historiales', { keyPath: 'local_id' })
        }
        if (!db.objectStoreNames.contains('ediciones')) {
          db.createObjectStore('ediciones', { keyPath: 'local_id' })
        }
      },
    })
  }
  return dbPromise
}

// --- Catálogos ---
export interface CatalogosCache {
  templates: FormTemplate[]
  productores: ProductorLite[]
  parcelas: ParcelaLite[]
  actualizado_en: number
}

export async function guardarCatalogos(c: CatalogosCache) {
  const db = await getDB()
  const tx = db.transaction('catalogos', 'readwrite')
  await tx.store.put(c.templates, 'templates')
  await tx.store.put(c.productores, 'productores')
  await tx.store.put(c.parcelas, 'parcelas')
  await tx.store.put(c.actualizado_en, 'actualizado_en')
  await tx.done
}

export async function leerCatalogos(): Promise<CatalogosCache | null> {
  const db = await getDB()
  const templates = (await db.get('catalogos', 'templates')) as FormTemplate[] | undefined
  const productores = (await db.get('catalogos', 'productores')) as ProductorLite[] | undefined
  const parcelas = (await db.get('catalogos', 'parcelas')) as ParcelaLite[] | undefined
  const actualizado_en = (await db.get('catalogos', 'actualizado_en')) as number | undefined
  if (!templates || !productores || !parcelas) return null
  return { templates, productores, parcelas, actualizado_en: actualizado_en ?? 0 }
}

// --- Outbox (fichas pendientes) ---
export async function encolarFicha(f: FichaPendiente) {
  const db = await getDB()
  await db.put('outbox', f)
}

export async function listarPendientes(): Promise<FichaPendiente[]> {
  const db = await getDB()
  return db.getAll('outbox')
}

export async function contarPendientes(): Promise<number> {
  const db = await getDB()
  return db.count('outbox')
}

export async function quitarPendiente(localId: string) {
  const db = await getDB()
  await db.delete('outbox', localId)
}

// --- Bitácoras pendientes ---
export async function encolarBitacora(b: BitacoraPendiente) {
  const db = await getDB()
  await db.put('bitacoras', b)
}
export async function listarBitacorasPendientes(): Promise<BitacoraPendiente[]> {
  const db = await getDB()
  return db.getAll('bitacoras')
}
export async function contarBitacorasPendientes(): Promise<number> {
  const db = await getDB()
  return db.count('bitacoras')
}
export async function quitarBitacoraPendiente(localId: string) {
  const db = await getDB()
  await db.delete('bitacoras', localId)
}

// --- Historiales pendientes ---
export async function encolarHistorial(h: HistorialPendiente) {
  const db = await getDB()
  await db.put('historiales', h)
}
export async function listarHistorialesPendientes(): Promise<HistorialPendiente[]> {
  const db = await getDB()
  return db.getAll('historiales')
}
export async function contarHistorialesPendientes(): Promise<number> {
  const db = await getDB()
  return db.count('historiales')
}
export async function quitarHistorialPendiente(localId: string) {
  const db = await getDB()
  await db.delete('historiales', localId)
}

// --- Ediciones pendientes (productor/parcela) ---
export async function encolarEdicion(e: EdicionPendiente) {
  const db = await getDB()
  await db.put('ediciones', e)
}
export async function listarEdicionesPendientes(): Promise<EdicionPendiente[]> {
  const db = await getDB()
  return db.getAll('ediciones')
}
export async function contarEdicionesPendientes(): Promise<number> {
  const db = await getDB()
  return db.count('ediciones')
}
export async function quitarEdicionPendiente(localId: string) {
  const db = await getDB()
  await db.delete('ediciones', localId)
}

// --- Remisiones pendientes (captura en campo) ---
export async function encolarRemision(r: RemisionPendiente) {
  const db = await getDB()
  await db.put('remisiones', r)
}

export async function listarRemisionesPendientes(): Promise<RemisionPendiente[]> {
  const db = await getDB()
  return db.getAll('remisiones')
}

export async function contarRemisionesPendientes(): Promise<number> {
  const db = await getDB()
  return db.count('remisiones')
}

export async function quitarRemisionPendiente(localId: string) {
  const db = await getDB()
  await db.delete('remisiones', localId)
}
