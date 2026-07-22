'use client'

// Retirar una ficha de circulación, desde el detalle.
//
// Anular es el camino normal y pide motivo: la ficha se queda en el expediente
// marcada y con la razón, que es lo que una auditoría de MAYACERT necesita
// poder leer. Borrar de verdad solo se ofrece al admin y solo sobre borradores
// o fichas ya anuladas — un duplicado de captura no prueba nada, pero una
// inspección aprobada sí, y si desaparece nadie puede explicar el hueco.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { puedeAnular, puedeBorrarDefinitivo } from '@/lib/ficha-workflow'
import type { EstadoFicha, RolMembresia } from '@/lib/types'

export default function FichaRetirar({
  fichaId,
  estado,
  rol,
}: {
  fichaId: string
  estado: EstadoFicha
  rol: RolMembresia
}) {
  const router = useRouter()
  const [modo, setModo] = useState<'cerrado' | 'anular' | 'borrar'>('cerrado')
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const puedeA = puedeAnular(estado, rol)
  const puedeB = puedeBorrarDefinitivo(estado, rol)
  if (!puedeA && !puedeB) return null

  async function ejecutar(definitivo: boolean) {
    setBusy(true)
    setError(null)
    try {
      const qs = definitivo
        ? '?definitivo=1'
        : `?motivo=${encodeURIComponent(motivo.trim())}`
      const res = await fetch(`/api/fichas/${fichaId}${qs}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)
      if (definitivo) {
        router.push('/fichas')
      } else {
        setModo('cerrado')
        router.refresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar')
      setBusy(false)
    }
  }

  if (modo === 'cerrado') {
    return (
      <div className="flex items-center gap-2">
        {puedeA && (
          <button
            onClick={() => setModo('anular')}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Anular
          </button>
        )}
        {puedeB && (
          <button
            onClick={() => setModo('borrar')}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Eliminar
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="absolute right-6 top-14 z-20 w-80 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
      {modo === 'anular' ? (
        <>
          <p className="text-sm font-semibold text-slate-800">Anular esta ficha</p>
          <p className="mt-1 text-xs text-slate-600">
            Se queda en el expediente marcada como anulada, con tu nombre y el
            motivo. Se puede reactivar. La estimación de cosecha que haya
            alimentado se retira del LPA.
          </p>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            autoFocus
            placeholder="¿Por qué se anula? Ej.: duplicada de la inspección del 20/07"
            className="mt-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400"
          />
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-red-800">Eliminar sin dejar rastro</p>
          <p className="mt-1 text-xs text-slate-600">
            La ficha y sus respuestas se borran de la base. Esto no se puede
            deshacer. Úsalo solo para capturas de prueba o duplicados; si la
            inspección ocurrió de verdad, <strong>anúlala</strong> en vez de
            borrarla.
          </p>
        </>
      )}

      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">{error}</p>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={() => {
            setModo('cerrado')
            setError(null)
          }}
          className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          Cancelar
        </button>
        <button
          onClick={() => ejecutar(modo === 'borrar')}
          disabled={busy || (modo === 'anular' && motivo.trim().length < 4)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
            modo === 'borrar'
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-slate-700 hover:bg-slate-800'
          }`}
        >
          {busy ? 'Aplicando…' : modo === 'borrar' ? 'Sí, eliminar' : 'Anular ficha'}
        </button>
      </div>
    </div>
  )
}
