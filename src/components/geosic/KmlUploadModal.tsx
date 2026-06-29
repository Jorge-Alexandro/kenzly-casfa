'use client'

// Modal to upload a KML/KMZ for a chosen parcela. Posts to the upload API
// which parses the geometry and persists it via PostGIS.
import { useState } from 'react'
import type { ParcelaGeoRow } from '@/lib/types'

interface Props {
  parcelas: ParcelaGeoRow[]
  onClose: () => void
  onUploaded: () => void
}

export default function KmlUploadModal({
  parcelas,
  onClose,
  onUploaded,
}: Props) {
  const [parcelaId, setParcelaId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const opciones = parcelas
    .filter((p) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return (
        p.codigo_parcela.toLowerCase().includes(q) ||
        (p.nombre ?? '').toLowerCase().includes(q) ||
        p.productor_nombre.toLowerCase().includes(q)
      )
    })
    .slice(0, 50)

  async function submit() {
    if (!parcelaId) {
      setError('Selecciona una parcela')
      return
    }
    if (!file) {
      setError('Selecciona un archivo KML o KMZ')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('parcela_id', parcelaId)
      const res = await fetch('/api/geosic/upload', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Error ${res.status}`)
      }
      onUploaded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al subir')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-800">
            Subir polígono (KML / KMZ)
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Parcela
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar parcelas…"
              className="mb-2 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400"
            />
            <select
              value={parcelaId}
              onChange={(e) => setParcelaId(e.target.value)}
              size={6}
              className="w-full rounded-md border border-slate-200 p-1 text-sm outline-none focus:border-orange-400"
            >
              {opciones.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.nombre || p.codigo_parcela) + ' · ' + p.productor_nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Archivo
            </label>
            <input
              type="file"
              accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-orange-700 hover:file:bg-orange-100"
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            disabled={busy}
            onClick={submit}
            className="rounded-md bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {busy ? 'Procesando…' : 'Subir y procesar'}
          </button>
        </div>
      </div>
    </div>
  )
}
