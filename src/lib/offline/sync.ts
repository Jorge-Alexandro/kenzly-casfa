// Lógica de sincronización offline para captura de fichas en campo.
'use client'

import {
  guardarCatalogos,
  leerCatalogos,
  encolarFicha,
  listarPendientes,
  quitarPendiente,
  contarPendientes,
  type FichaPendiente,
  type CatalogosCache,
} from './db'

// Descarga catálogos del servidor y los cachea en IndexedDB. Solo online.
export async function sincronizarCatalogos(): Promise<CatalogosCache | null> {
  const res = await fetch('/api/sync/catalogos', { cache: 'no-store' })
  if (!res.ok) throw new Error(`sync catálogos: ${res.status}`)
  const data = await res.json()
  const cache: CatalogosCache = {
    templates: data.templates ?? [],
    productores: data.productores ?? [],
    parcelas: data.parcelas ?? [],
    actualizado_en: Date.now(),
  }
  await guardarCatalogos(cache)
  return cache
}

// Devuelve catálogos: del servidor si hay red, o del caché local si no.
export async function obtenerCatalogos(): Promise<CatalogosCache | null> {
  if (navigator.onLine) {
    try {
      return await sincronizarCatalogos()
    } catch {
      // cae al caché si la red falla
    }
  }
  return leerCatalogos()
}

export interface ResultadoEnvio {
  online: boolean // true = se mandó al servidor; false = quedó en cola
  fichaId?: string
}

// Envía la ficha al servidor; si no hay red (o falla), la guarda en la cola.
export async function enviarOEncolar(
  body: FichaPendiente['body'],
  etiqueta: string,
): Promise<ResultadoEnvio> {
  if (navigator.onLine) {
    try {
      const res = await fetch('/api/fichas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const { ficha_id } = await res.json()
        return { online: true, fichaId: ficha_id }
      }
      // Si el servidor responde error (p.ej. 400) NO encolamos: es un fallo real.
      const b = await res.json().catch(() => ({}))
      throw new Error(b.error ?? `Error ${res.status}`)
    } catch (e) {
      // Error de red (offline real) → encolar. Error de validación → propagar.
      if (e instanceof TypeError) {
        await encolar(body, etiqueta)
        return { online: false }
      }
      throw e
    }
  }
  await encolar(body, etiqueta)
  return { online: false }
}

async function encolar(body: FichaPendiente['body'], etiqueta: string) {
  await encolarFicha({
    local_id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
    creada_en: Date.now(),
    body,
    etiqueta,
  })
}

// Intenta enviar todas las fichas pendientes. Devuelve cuántas se sincronizaron.
export async function vaciarCola(): Promise<{ enviadas: number; restantes: number }> {
  if (!navigator.onLine) return { enviadas: 0, restantes: await contarPendientes() }
  const pendientes = await listarPendientes()
  let enviadas = 0
  for (const f of pendientes) {
    try {
      const res = await fetch('/api/fichas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f.body),
      })
      if (res.ok) {
        await quitarPendiente(f.local_id)
        enviadas++
      } else {
        // Error del servidor (no de red): la dejamos en cola y seguimos.
      }
    } catch {
      // Sin red: detenemos el ciclo.
      break
    }
  }
  return { enviadas, restantes: await contarPendientes() }
}

export { contarPendientes }
