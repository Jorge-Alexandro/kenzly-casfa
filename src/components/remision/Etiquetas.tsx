'use client'

// Generador de etiquetas colgantes para imprimir en la oficina.
//
// Sale a papel desde el navegador (Ctrl+P), no a un PDF: es lo más barato y no
// necesita nada instalado. Se imprime en cartulina, se corta y se perfora; la
// etiqueta se amarra al cuello del saco con rafia.
//
// NO se usa etiqueta adhesiva: el pegamento no agarra en yute ni en henequén y
// se cae en el primer traslado. Por eso el diseño lleva el círculo de la
// perforación marcado.
import { useState } from 'react'
import { qrPath } from '@/lib/remision/qr.mjs'

const CICLO_DEFAULT = '2025-2026'

export default function Etiquetas() {
  const [ciclo, setCiclo] = useState(CICLO_DEFAULT)
  const [cantidad, setCantidad] = useState(100)
  const [codigos, setCodigos] = useState<string[]>([])
  const [rango, setRango] = useState<{ desde: number; hasta: number } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generar() {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch('/api/remisiones/etiquetas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ciclo, cantidad }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`)
      setCodigos(json.codigos)
      setRango({ desde: json.desde, hasta: json.hasta })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">Ciclo</span>
            <input
              value={ciclo}
              onChange={(e) => setCiclo(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">Cuántas etiquetas</span>
            <input
              type="number"
              min={1}
              max={2000}
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
              className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            onClick={generar}
            disabled={cargando}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-50"
          >
            {cargando ? 'Generando…' : 'Generar'}
          </button>
          {codigos.length > 0 && (
            <button
              onClick={() => window.print()}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Imprimir
            </button>
          )}
        </div>

        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {rango && (
          <p className="mt-3 text-xs text-slate-500">
            {codigos.length} etiquetas del consecutivo {rango.desde} al {rango.hasta}. Ya quedaron
            registradas: una etiqueta que no esté en el sistema se rechaza al sincronizar.
            Imprime en cartulina, corta y perfora el círculo.
          </p>
        )}
      </div>

      {codigos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4 print:gap-0">
          {codigos.map((c) => (
            <EtiquetaSaco key={c} codigo={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function EtiquetaSaco({ codigo }: { codigo: string }) {
  const { d, modulos } = qrPath(codigo)
  return (
    <div className="flex break-inside-avoid flex-col items-center gap-1 border border-dashed border-slate-300 bg-white p-3">
      {/* El agujero por donde pasa la rafia. */}
      <div className="h-3 w-3 rounded-full border border-slate-400" />
      <svg viewBox={`0 0 ${modulos} ${modulos}`} className="h-24 w-24" shapeRendering="crispEdges">
        <rect width={modulos} height={modulos} fill="#fff" />
        <path d={d} fill="#000" />
      </svg>
      <p className="text-center font-mono text-[11px] font-bold tracking-tight text-slate-900">
        {codigo}
      </p>
      <p className="text-[8px] uppercase tracking-wide text-slate-400">CASFA</p>
    </div>
  )
}
