'use client'

// Contenido de la página /offline. Como /offline es estática y el service worker
// la precachea, SIEMPRE carga sin conexión. Aquí montamos directamente el
// capturador de fichas (FichaCaptureClient), que lee los catálogos del caché
// local (IndexedDB) y encola las fichas offline. Así la captura funciona sin
// depender del servidor ni de /fichas/nueva (que es dinámica y necesita red).
import { useState } from 'react'
import FichaCaptureClient from '@/components/fichas/FichaCaptureClient'

export default function OfflineClient() {
  const [capturando, setCapturando] = useState(false)

  if (capturando) {
    return (
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
          <button
            onClick={() => setCapturando(false)}
            className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            ← Atrás
          </button>
          <span className="text-sm font-semibold text-slate-800">
            Nueva ficha (sin conexión)
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <FichaCaptureClient />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      {/* Emblema inline (SVG) para que se vea aunque no haya red */}
      <svg width="72" height="48" viewBox="0 0 72 48" className="mb-4" aria-hidden="true">
        <path d="M4 44 A32 32 0 0 1 68 44 Z" fill="#F8921D" />
      </svg>

      <h1 className="text-lg font-semibold text-slate-800">Estás sin conexión</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        No hay internet en este momento. Puedes seguir{' '}
        <strong>levantando fichas</strong>: se guardan en el dispositivo y se suben
        solas cuando vuelva la señal.
      </p>

      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <button
          onClick={() => setCapturando(true)}
          className="rounded-md bg-orange-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-orange-600"
        >
          Levantar ficha
        </button>
        <a
          href="/fichas"
          className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Ver fichas (requiere señal)
        </a>
      </div>

      <p className="mt-6 max-w-sm text-xs text-slate-400">
        Consejo: abre la app <strong>con internet</strong> al menos una vez al día
        para descargar los datos más recientes (productores, parcelas y
        formularios).
      </p>
    </div>
  )
}
