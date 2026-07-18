// Lógica de sincronización offline para captura de fichas en campo.
'use client'

import {
  guardarCatalogos,
  leerCatalogos,
  encolarFicha,
  listarPendientes,
  quitarPendiente,
  contarPendientes as contarFichasPendientes,
  encolarRemision,
  listarRemisionesPendientes,
  quitarRemisionPendiente,
  contarRemisionesPendientes,
  encolarBitacora,
  listarBitacorasPendientes,
  quitarBitacoraPendiente,
  contarBitacorasPendientes,
  encolarHistorial,
  listarHistorialesPendientes,
  quitarHistorialPendiente,
  contarHistorialesPendientes,
  encolarEdicion,
  listarEdicionesPendientes,
  quitarEdicionPendiente,
  contarEdicionesPendientes,
  type FichaPendiente,
  type RemisionPendiente,
  type BitacoraPendiente,
  type HistorialPendiente,
  type EdicionPendiente,
  type CatalogosCache,
} from './db'

function uuid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random())
}

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
  await encolarFicha({ local_id: uuid(), creada_en: Date.now(), body, etiqueta })
}

// --- Bitácoras: mismo contrato que las fichas (online manda; offline encola) ---
export async function enviarOEncolarBitacora(
  body: BitacoraPendiente['body'],
  etiqueta: string,
): Promise<{ online: boolean; id?: string }> {
  if (navigator.onLine) {
    try {
      const res = await fetch('/api/bitacora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const { id } = await res.json()
        return { online: true, id }
      }
      const b = await res.json().catch(() => ({}))
      throw new Error(b.error ?? `Error ${res.status}`)
    } catch (e) {
      if (e instanceof TypeError) {
        await encolarBitacora({ local_id: uuid(), creada_en: Date.now(), body, etiqueta })
        return { online: false }
      }
      throw e
    }
  }
  await encolarBitacora({ local_id: uuid(), creada_en: Date.now(), body, etiqueta })
  return { online: false }
}

// --- Historiales: mismo contrato ---
export async function enviarOEncolarHistorial(
  body: HistorialPendiente['body'],
  etiqueta: string,
): Promise<{ online: boolean }> {
  if (navigator.onLine) {
    try {
      const res = await fetch('/api/historial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) return { online: true }
      const b = await res.json().catch(() => ({}))
      throw new Error(b.error ?? `Error ${res.status}`)
    } catch (e) {
      if (e instanceof TypeError) {
        await encolarHistorial({ local_id: uuid(), creada_en: Date.now(), body, etiqueta })
        return { online: false }
      }
      throw e
    }
  }
  await encolarHistorial({ local_id: uuid(), creada_en: Date.now(), body, etiqueta })
  return { online: false }
}

// --- Ediciones de productor/parcela: PATCH online o encolar offline ---
function endpointEdicion(tipo: EdicionPendiente['tipo'], id: string) {
  return tipo === 'productor' ? `/api/productores/${id}` : `/api/parcelas/${id}`
}

export async function enviarOEncolarEdicion(
  tipo: EdicionPendiente['tipo'],
  id: string,
  cambios: Record<string, unknown>,
  etiqueta: string,
): Promise<{ online: boolean }> {
  if (navigator.onLine) {
    try {
      const res = await fetch(endpointEdicion(tipo, id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios),
      })
      if (res.ok) return { online: true }
      const b = await res.json().catch(() => ({}))
      throw new Error(b.error ?? `Error ${res.status}`)
    } catch (e) {
      if (e instanceof TypeError) {
        await encolarEdicion({ local_id: uuid(), creada_en: Date.now(), tipo, id, cambios, etiqueta })
        return { online: false }
      }
      throw e
    }
  }
  await encolarEdicion({ local_id: uuid(), creada_en: Date.now(), tipo, id, cambios, etiqueta })
  return { online: false }
}

// Suma de pendientes de todas las colas (fichas + bitácoras + historiales + ediciones).
export async function contarPendientes(): Promise<number> {
  const [f, b, h, e] = await Promise.all([
    contarFichasPendientes(),
    contarBitacorasPendientes(),
    contarHistorialesPendientes(),
    contarEdicionesPendientes(),
  ])
  return f + b + h + e
}

// Lista legible de TODO lo pendiente de subir (para "ver borradores pendientes").
export interface PendienteResumen {
  tipo: 'Ficha' | 'Bitácora' | 'Historial'
  etiqueta: string
  creada_en: number
}
export async function listarTodosPendientes(): Promise<PendienteResumen[]> {
  const [fichas, bitas, hists] = await Promise.all([
    listarPendientes(),
    listarBitacorasPendientes(),
    listarHistorialesPendientes(),
  ])
  const items: PendienteResumen[] = [
    ...fichas.map((f) => ({ tipo: 'Ficha' as const, etiqueta: f.etiqueta, creada_en: f.creada_en })),
    ...bitas.map((b) => ({ tipo: 'Bitácora' as const, etiqueta: b.etiqueta, creada_en: b.creada_en })),
    ...hists.map((h) => ({ tipo: 'Historial' as const, etiqueta: h.etiqueta, creada_en: h.creada_en })),
  ]
  return items.sort((a, b) => b.creada_en - a.creada_en)
}

// Intenta enviar TODO lo pendiente (fichas, bitácoras, historiales).
export async function vaciarCola(): Promise<{ enviadas: number; restantes: number }> {
  if (!navigator.onLine) return { enviadas: 0, restantes: await contarPendientes() }
  let enviadas = 0

  // Fichas
  for (const f of await listarPendientes()) {
    try {
      const res = await fetch('/api/fichas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f.body),
      })
      if (res.ok) {
        await quitarPendiente(f.local_id)
        enviadas++
      }
    } catch {
      break // sin red
    }
  }

  // Bitácoras
  for (const b of await listarBitacorasPendientes()) {
    try {
      const res = await fetch('/api/bitacora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b.body),
      })
      if (res.ok) {
        await quitarBitacoraPendiente(b.local_id)
        enviadas++
      }
    } catch {
      break
    }
  }

  // Historiales
  for (const h of await listarHistorialesPendientes()) {
    try {
      const res = await fetch('/api/historial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(h.body),
      })
      if (res.ok) {
        await quitarHistorialPendiente(h.local_id)
        enviadas++
      }
    } catch {
      break
    }
  }

  // Ediciones de productor/parcela
  for (const e of await listarEdicionesPendientes()) {
    try {
      const res = await fetch(endpointEdicion(e.tipo, e.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(e.cambios),
      })
      if (res.ok) {
        await quitarEdicionPendiente(e.local_id)
        enviadas++
      }
    } catch {
      break
    }
  }

  return { enviadas, restantes: await contarPendientes() }
}

// ---------------------------------------------------------------------------
// Remisiones de campo
// ---------------------------------------------------------------------------
// Mismo contrato que las fichas: si hay red se manda, si no se encola. La
// diferencia es que el servidor hace UPSERT por local_id, así que reintentar un
// envío que sí llegó (pero cuya respuesta se perdió) es inofensivo — que es el
// caso normal cuando la señal entra y sale.

export async function enviarOEncolarRemision(
  body: RemisionPendiente['body'],
  etiqueta: string,
): Promise<ResultadoEnvio> {
  if (navigator.onLine) {
    try {
      const res = await fetch('/api/remisiones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) return { online: true }
      const b = await res.json().catch(() => ({}))
      throw new Error(b.error ?? `Error ${res.status}`)
    } catch (e) {
      // TypeError = fallo de red real → se encola. Un 400 es un dato malo y se
      // propaga: encolarlo sólo aplazaría el error hasta que nadie lo mire.
      if (e instanceof TypeError) {
        await encolarRemisionLocal(body, etiqueta)
        return { online: false }
      }
      throw e
    }
  }
  await encolarRemisionLocal(body, etiqueta)
  return { online: false }
}

async function encolarRemisionLocal(body: RemisionPendiente['body'], etiqueta: string) {
  await encolarRemision({ local_id: body.local_id, creada_en: Date.now(), body, etiqueta })
}

export async function vaciarColaRemisiones(): Promise<{ enviadas: number; restantes: number }> {
  if (!navigator.onLine) {
    return { enviadas: 0, restantes: await contarRemisionesPendientes() }
  }
  const pendientes = await listarRemisionesPendientes()
  let enviadas = 0
  for (const r of pendientes) {
    try {
      const res = await fetch('/api/remisiones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r.body),
      })
      if (res.ok) {
        await quitarRemisionPendiente(r.local_id)
        enviadas++
      }
      // Si el servidor la rechaza (400), se queda en la cola y se muestra en la
      // UI: es un dato que alguien tiene que corregir, no se descarta solo.
    } catch {
      break // sin red
    }
  }
  return { enviadas, restantes: await contarRemisionesPendientes() }
}

export { contarRemisionesPendientes }
