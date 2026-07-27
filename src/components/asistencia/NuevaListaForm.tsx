'use client'

// Alta de una lista de asistencia. El folio lo asigna el servidor.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NuevaListaForm() {
  const router = useRouter()
  const [evento, setEvento] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [lugar, setLugar] = useState('')
  const [capacitador, setCapacitador] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function crear() {
    if (!evento.trim()) return setError('Escribe el nombre del evento.')
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/asistencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_evento: evento, fecha, lugar, capacitador }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo crear')
      router.push(`/asistencia/${data.id}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">Nueva lista de asistencia</h1>
        <Link href="/asistencia" className="text-sm text-slate-500 hover:text-slate-700">
          ← Volver
        </Link>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <Campo label="Nombre del evento">
          <input
            value={evento}
            onChange={(e) => setEvento(e.target.value)}
            placeholder="Taller de agroecología, auditoría interna…"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Fecha">
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </Campo>
          <Campo label="Capacitador / responsable">
            <input
              value={capacitador}
              onChange={(e) => setCapacitador(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </Campo>
        </div>
        <Campo label="Lugar del evento">
          <input
            value={lugar}
            onChange={(e) => setLugar(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Campo>

        {error && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Link href="/asistencia" className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Cancelar
          </Link>
          <button
            onClick={crear}
            disabled={busy}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-60"
          >
            {busy ? 'Creando…' : 'Crear y abrir registro'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  )
}
