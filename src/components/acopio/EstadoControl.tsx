'use client'

// Control del flujo de la entrada: avanzar al siguiente estado, volver atrás o
// cancelar. Muestra EXPLÍCITAMENTE qué falta para poder avanzar (pesadas,
// calidad, firmas) en vez de deshabilitar el botón sin explicación.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TRANSICIONES, puedeTransicionar, siguiente, esSupervisor,
  type EntradaEstado,
} from '@/lib/acopio/estado'
import { ESTADO_ENTRADA_LABEL, ESTADO_ENTRADA_BADGE, type EstadoEntrada } from '@/lib/acopio/tipos'
import type { RolMembresia } from '@/lib/types'

export default function EstadoControl({
  entradaId,
  actual,
  rol,
}: {
  entradaId: string
  actual: EntradaEstado
  rol: RolMembresia
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sig = siguiente(actual.estado)
  const evalSig = sig ? puedeTransicionar(actual, sig, rol) : null

  // Otras transiciones posibles (volver atrás / cancelar / reabrir).
  const otras = (TRANSICIONES[actual.estado] ?? []).filter((h) => h !== sig)

  async function cambiar(hacia: EstadoEntrada) {
    setError(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/acopio/entradas/${entradaId}/estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: hacia }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cambiar el estado')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_ENTRADA_BADGE[actual.estado]}`}>
            {ESTADO_ENTRADA_LABEL[actual.estado]}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {otras.map((h) => (
            <button
              key={h}
              onClick={() => cambiar(h)}
              disabled={busy || (!esSupervisor(rol) && !puedeTransicionar(actual, h, rol).ok)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              title={puedeTransicionar(actual, h, rol).motivos.join(' · ')}
            >
              {h === 'cancelada' ? 'Cancelar' : `↩ ${ESTADO_ENTRADA_LABEL[h]}`}
            </button>
          ))}

          {sig && (
            <button
              onClick={() => cambiar(sig)}
              disabled={busy || !evalSig?.ok}
              className="rounded-md bg-orange-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {busy ? 'Guardando…' : `Pasar a ${ESTADO_ENTRADA_LABEL[sig]} →`}
            </button>
          )}
        </div>
      </div>

      {/* Por qué no se puede avanzar todavía */}
      {sig && evalSig && !evalSig.ok && (
        <ul className="mt-3 list-disc space-y-0.5 rounded-md bg-amber-50 px-6 py-2 text-xs text-amber-800">
          {evalSig.motivos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </section>
  )
}
