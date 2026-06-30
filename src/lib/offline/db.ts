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

interface KenzlyDB extends DBSchema {
  catalogos: {
    key: string
    value: unknown
  }
  outbox: {
    key: string
    value: FichaPendiente
  }
}

const DB_NAME = 'kenzly-geosic'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<KenzlyDB>> | null = null

function getDB() {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB solo está disponible en el navegador')
  }
  if (!dbPromise) {
    dbPromise = openDB<KenzlyDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('catalogos')) {
          db.createObjectStore('catalogos')
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'local_id' })
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
