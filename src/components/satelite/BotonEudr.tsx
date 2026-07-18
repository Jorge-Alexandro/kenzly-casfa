'use client'

// "Análisis EUDR": tamiza cada parcela con polígono comparando su cobertura de
// 2020 contra la actual (Sentinel-2) para detectar posible pérdida de cobertura
// posterior a 2020. Va por lotes desde el cliente (como Actualizar satélite).
import { useState } from 'react'

const TAM_LOTE = 8 // = MAX_POR_LOTE en la API

export default function BotonEudr({
  parcelaIds,
  onListo,
}: {
  parcelaIds: string[]
  onListo: () => void
}) {
  const [corriendo, setCorriendo] = useState(false)
  const [hechas, setHechas] = useState(0)
  const [riesgo, setRiesgo] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const total = parcelaIds.length

  async function analizar() {
    if (corriendo || total === 0) return
    setCorriendo(true)
    setHechas(0)
    setRiesgo(0)
    setError(null)
    let enRiesgo = 0
    try {
      for (let i = 0; i < total; i += TAM_LOTE) {
        const lote = parcelaIds.slice(i, i + TAM_LOTE)
        const res = await fetch('/api/sentinel/eudr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parcela_ids: lote }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
        const resultados: { clasificacion: string }[] = body.resultados ?? []
        enRiesgo += resultados.filter((r) => r.clasificacion === 'posible_perdida').length
        setHechas(Math.min(i + lote.length, total))
        setRiesgo(enRiesgo)
      }
      onListo()
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
        onClick={analizar}
        disabled={corriendo || total === 0}
        title="Comparar cobertura 2020 vs actual por NDVI (monitoreo de despejes)"
        className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
      >
        {corriendo ? `Analizando… ${pct}%` : '🌲 Monitoreo cobertura'}
      </button>

      {(corriendo || error) && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md bg-white p-3 shadow-lg ring-1 ring-slate-200">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {hechas} de {total} parcelas
                {riesgo > 0 && <span className="font-medium text-red-600"> · {riesgo} posible pérdida</span>}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Comparando cobertura 2020 vs actual. No cierres la pestaña.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
