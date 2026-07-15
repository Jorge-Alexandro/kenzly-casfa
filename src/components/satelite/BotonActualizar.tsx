'use client'

// "Actualizar satélite": trae las imágenes de Sentinel-2 de todas las parcelas
// con polígono.
//
// Va por lotes desde el CLIENTE a propósito. Son ~153 parcelas × 1-3 s por
// llamada a Copernicus: en una sola petición nos comeríamos el timeout de la
// función serverless. Troceando, cada request cabe de sobra en los 60 s, el
// usuario ve avance real, y si una parcela truena el resto sigue.
import { useState } from 'react'

const TAM_LOTE = 10 // debe coincidir con MAX_POR_LOTE en la API route

interface Props {
  parcelaIds: string[]
  onListo: () => void
}

export default function BotonActualizar({ parcelaIds, onListo }: Props) {
  const [corriendo, setCorriendo] = useState(false)
  const [hechas, setHechas] = useState(0)
  const [fallidas, setFallidas] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const total = parcelaIds.length

  async function actualizar() {
    if (corriendo || total === 0) return
    setCorriendo(true)
    setHechas(0)
    setFallidas(0)
    setError(null)

    let conError = 0

    try {
      for (let i = 0; i < total; i += TAM_LOTE) {
        const lote = parcelaIds.slice(i, i + TAM_LOTE)

        const res = await fetch('/api/sentinel/ndvi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parcela_ids: lote, meses: 6 }),
        })
        const body = await res.json().catch(() => ({}))

        // Un 401/403/500 sí aborta: es un problema de credenciales o permisos,
        // no de una parcela suelta, y reintentar 15 veces no lo va a arreglar.
        if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)

        const resultados: { error: string | null }[] = body.resultados ?? []
        conError += resultados.filter((r) => r.error !== null).length

        setHechas(Math.min(i + lote.length, total))
        setFallidas(conError)
      }

      onListo() // router.refresh(): recarga mapa, lista e indicadores
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setCorriendo(false)
    }
  }

  const pct = total > 0 ? Math.round((hechas / total) * 100) : 0

  return (
    <div className="relative">
      <button
        onClick={actualizar}
        disabled={corriendo || total === 0}
        title={
          total === 0
            ? 'No hay parcelas con polígono que medir'
            : `Consultar Sentinel-2 para ${total} parcelas`
        }
        className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
      >
        {corriendo ? `Midiendo… ${pct}%` : '↻ Actualizar satélite'}
      </button>

      {(corriendo || error) && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md bg-white p-3 shadow-lg ring-1 ring-slate-200">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-orange-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {hechas} de {total} parcelas
                {fallidas > 0 && (
                  <span className="text-slate-400"> · {fallidas} sin imagen despejada</span>
                )}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Consultando Copernicus Sentinel-2. No cierres esta pestaña.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
