'use client'

// Contenido de la página /offline. Como /offline es estática y el service worker
// la precachea, SIEMPRE carga sin conexión. Desde aquí se captura SIN servidor:
//   - Ficha    -> FichaCaptureClient (lee catálogos del caché, encola la ficha)
//   - Bitácora -> BitacoraEditor con parcelas del caché, encola la bitácora
//   - Historial-> elige parcela del caché y captura, encola el historial
// Todo se sube solo al recuperar señal.
import { useEffect, useState } from 'react'
import FichaCaptureClient from '@/components/fichas/FichaCaptureClient'
import BitacoraEditor from '@/components/bitacora/BitacoraEditor'
import HistorialEditor from '@/components/historial/HistorialEditor'
import { leerCatalogos } from '@/lib/offline/db'
import { codigoCorto } from '@/lib/format'
import ParcelaBuscador from '@/components/ParcelaBuscador'
import PendientesLocales from '@/components/PendientesLocales'
import type { ParcelaLite } from '@/lib/types'

type Vista = 'menu' | 'ficha' | 'bitacora' | 'historial'

export default function OfflineClient() {
  const [vista, setVista] = useState<Vista>('menu')
  const [guardado, setGuardado] = useState<string | null>(null)

  // Los editores navegan al guardar, y sin señal esas rutas no existen: el
  // service worker rebota aquí y parece que falló. Con el acuse se regresan al
  // menú con la confirmación puesta.
  function volverConAcuse(que: string) {
    setGuardado(que)
    setVista('menu')
  }

  if (vista === 'ficha') {
    return (
      <Marco titulo="Nueva ficha (sin conexión)" onVolver={() => setVista('menu')}>
        <FichaCaptureClient />
      </Marco>
    )
  }
  if (vista === 'bitacora') {
    return (
      <Marco titulo="Nueva bitácora (sin conexión)" onVolver={() => setVista('menu')}>
        <BitacoraOffline onGuardada={() => volverConAcuse('La bitácora')} />
      </Marco>
    )
  }
  if (vista === 'historial') {
    return (
      <Marco titulo="Nuevo historial (sin conexión)" onVolver={() => setVista('menu')}>
        <HistorialOffline onGuardado={() => volverConAcuse('El historial')} />
      </Marco>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <svg width="72" height="48" viewBox="0 0 72 48" className="mb-4" aria-hidden="true">
        <path d="M4 44 A32 32 0 0 1 68 44 Z" fill="#F8921D" />
      </svg>

      <h1 className="text-lg font-semibold text-slate-800">Estás sin conexión</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        No hay internet en este momento. Puedes seguir capturando: todo se guarda
        en el dispositivo y se sube solo cuando vuelva la señal.
      </p>

      {guardado && (
        <p className="mt-4 w-full max-w-sm rounded-md bg-green-50 px-4 py-2.5 text-sm text-green-800">
          ✓ {guardado} quedó guardada en el dispositivo.
        </p>
      )}

      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <button
          onClick={() => setVista('ficha')}
          className="rounded-md bg-orange-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-orange-600"
        >
          Levantar ficha
        </button>
        <button
          onClick={() => setVista('bitacora')}
          className="rounded-md border border-orange-200 bg-white px-4 py-2.5 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
        >
          Nueva bitácora
        </button>
        <button
          onClick={() => setVista('historial')}
          className="rounded-md border border-orange-200 bg-white px-4 py-2.5 text-sm font-medium text-orange-700 transition hover:bg-orange-50"
        >
          Nuevo historial
        </button>
      </div>

      {/* Lo que lleva encolado, con opción de corregirlo aquí mismo: el
          inspector se equivoca y no puede esperar a tener señal para arreglarlo. */}
      <div className="mt-6 w-full max-w-xl text-left">
        <PendientesLocales titulo="Falta subir (puedes corregirlo aquí)" />
      </div>

      <p className="max-w-sm text-xs text-slate-400">
        Consejo: abre la app <strong>con internet</strong> al menos una vez al día
        para descargar los datos más recientes (productores, parcelas y
        formularios).
      </p>
    </div>
  )
}

function Marco({
  titulo,
  onVolver,
  children,
}: {
  titulo: string
  onVolver: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
        <button
          onClick={onVolver}
          className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
        >
          ← Atrás
        </button>
        <span className="text-sm font-semibold text-slate-800">{titulo}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  )
}

// Hook que lee las parcelas cacheadas (IndexedDB) para captura offline.
function useParcelasCache() {
  const [estado, setEstado] = useState<
    { fase: 'cargando' } | { fase: 'listo'; parcelas: ParcelaLite[] } | { fase: 'sin_datos' }
  >({ fase: 'cargando' })
  useEffect(() => {
    leerCatalogos()
      .then((c) =>
        setEstado(
          c && c.parcelas.length > 0
            ? { fase: 'listo', parcelas: c.parcelas }
            : { fase: 'sin_datos' },
        ),
      )
      .catch(() => setEstado({ fase: 'sin_datos' }))
  }, [])
  return estado
}

function SinDatos() {
  return (
    <div className="mx-auto max-w-md p-10 text-center text-sm text-slate-500">
      No hay parcelas descargadas en este dispositivo. Conéctate a internet una vez
      (con tu sesión iniciada) para descargarlas y poder capturar sin señal.
    </div>
  )
}

function BitacoraOffline({ onGuardada }: { onGuardada: () => void }) {
  const est = useParcelasCache()
  if (est.fase === 'cargando')
    return <div className="p-10 text-center text-sm text-slate-500">Cargando parcelas…</div>
  if (est.fase === 'sin_datos') return <SinDatos />
  return (
    <BitacoraEditor
      mode="nueva"
      parcelas={est.parcelas}
      anioInicial={new Date().getFullYear()}
      onGuardada={onGuardada}
    />
  )
}

function HistorialOffline({ onGuardado }: { onGuardado: () => void }) {
  const est = useParcelasCache()
  const [parcela, setParcela] = useState<ParcelaLite | null>(null)

  if (est.fase === 'cargando')
    return <div className="p-10 text-center text-sm text-slate-500">Cargando parcelas…</div>
  if (est.fase === 'sin_datos') return <SinDatos />

  if (parcela) {
    const cod = codigoCorto(parcela.codigo_parcela, parcela.nombre)
    return (
      <HistorialEditor
        parcelaId={parcela.id}
        parcelaLabel={`${parcela.nombre || cod} · ${cod}`}
        aniosIniciales={[]}
        onGuardado={onGuardado}
      />
    )
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <label className="mb-1 block text-sm font-medium text-slate-700">
        Elige la parcela
      </label>
      <ParcelaBuscador
        parcelas={est.parcelas}
        value=""
        onChange={(id) => {
          const p = est.parcelas.find((x) => x.id === id)
          if (p) setParcela(p)
        }}
      />
      <p className="mt-2 text-xs text-slate-400">
        {est.parcelas.length} parcelas descargadas en este dispositivo.
      </p>
    </div>
  )
}
