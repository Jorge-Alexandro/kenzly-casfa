'use client'

// Barra de flujo de la ficha: muestra el estado actual y los botones de
// transición permitidos para el rol. No se imprime (vive en la toolbar).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EstadoFicha, RolMembresia } from '@/lib/types'
import { ESTADO_FICHA_LABEL } from '@/lib/types'
import { accionesPermitidas, ESTADO_FICHA_BADGE } from '@/lib/ficha-workflow'

const TONO: Record<string, string> = {
  primary: 'bg-orange-500 text-white hover:bg-orange-600',
  positive: 'bg-green-600 text-white hover:bg-green-700',
  danger: 'border border-red-200 text-red-600 hover:bg-red-50',
  neutral: 'border border-slate-200 text-slate-600 hover:bg-slate-50',
}

export default function FichaEstadoControl({
  fichaId,
  estado,
  rol,
}: {
  fichaId: string
  estado: EstadoFicha
  rol: RolMembresia
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const acciones = accionesPermitidas(estado, rol)

  async function cambiar(to: EstadoFicha) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/fichas/${fichaId}/estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: to }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error ?? `Error ${res.status}`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_FICHA_BADGE[estado]}`}
      >
        {ESTADO_FICHA_LABEL[estado]}
      </span>
      {acciones.map((a) => (
        <button
          key={a.to}
          disabled={busy}
          onClick={() => cambiar(a.to)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${TONO[a.tono]}`}
        >
          {a.label}
        </button>
      ))}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
