'use client'

// "Bosque 2020 (UE)": por cada parcela con polígono, calcula el % de traslape
// con la capa de bosque 2020 de la UE (JRC GFC2020). Replica el paso geoespacial
// de MAYACERT para detectar riesgo EUDR ANTES de certificar. Va por lotes.
import { useState } from 'react'

const TAM_LOTE = 12

export default function BotonBosque2020({
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
        const res = await fetch('/api/sentinel/forest2020', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parcela_ids: lote }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
        const resultados: { clase: string }[] = body.resultados ?? []
        enRiesgo += resultados.filter((r) => r.clase !== 'sin_traslape').length
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
        title="Traslape con la capa de bosque 2020 de la UE (JRC) — tamizado EUDR"
        className="rounded-md border border-green-600 bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
      >
        {corriendo ? `Bosque 2020… ${pct}%` : '🌳 Bosque 2020 (UE)'}
      </button>

      {(corriendo || error) && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-md bg-white p-3 shadow-lg ring-1 ring-slate-200">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : (
            <>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {hechas} de {total} parcelas
                {riesgo > 0 && <span className="font-medium text-red-600"> · {riesgo} con traslape</span>}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Consultando capa de bosque 2020 de la UE (JRC).
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
