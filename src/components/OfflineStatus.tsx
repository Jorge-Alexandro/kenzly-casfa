'use client'

// Indicador de conexión + cola de fichas pendientes. Vive en el header.
// Al recuperar conexión: refresca catálogos y vacía la cola automáticamente.
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { vaciarCola, sincronizarCatalogos, contarPendientes } from '@/lib/offline/sync'

export default function OfflineStatus() {
  const router = useRouter()
  const [online, setOnline] = useState(true)
  const [pendientes, setPendientes] = useState(0)
  const [sincronizando, setSincronizando] = useState(false)

  const refrescarConteo = useCallback(async () => {
    try {
      setPendientes(await contarPendientes())
    } catch {
      /* IndexedDB no disponible: ignorar */
    }
  }, [])

  const sincronizar = useCallback(async () => {
    if (!navigator.onLine) return
    setSincronizando(true)
    try {
      await sincronizarCatalogos().catch(() => {})
      const { enviadas } = await vaciarCola()
      await refrescarConteo()
      if (enviadas > 0) router.refresh()
    } finally {
      setSincronizando(false)
    }
  }, [refrescarConteo, router])

  useEffect(() => {
    setOnline(navigator.onLine)
    refrescarConteo()

    const onOnline = () => {
      setOnline(true)
      sincronizar()
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Sincroniza al cargar si hay red (refresca catálogos para uso offline).
    if (navigator.onLine) sincronizar()

    // Refresca el conteo periódicamente (capturas en otra pestaña/SW).
    const t = setInterval(refrescarConteo, 15000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(t)
    }
  }, [refrescarConteo, sincronizar])

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
          online ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}
        title={online ? 'Con conexión' : 'Sin conexión — las capturas se guardan en el dispositivo'}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-green-500' : 'bg-amber-500'}`} />
        {online ? 'En línea' : 'Offline'}
      </span>

      {pendientes > 0 && (
        <button
          onClick={sincronizar}
          disabled={!online || sincronizando}
          className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 hover:bg-orange-200 disabled:opacity-60"
          title="Fichas guardadas en el dispositivo, pendientes de subir"
        >
          {sincronizando ? 'Sincronizando…' : `${pendientes} por subir ↑`}
        </button>
      )}
    </div>
  )
}
