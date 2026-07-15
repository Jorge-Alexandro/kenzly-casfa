'use client'

// Marca una actividad pendiente como completada, pidiendo el resultado.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from './Modal'
import { INPUT, LABEL, BTN_PRIMARIO, claseMensaje } from './ui'

export default function CompletarActividadBoton({ actividadId, asunto }: { actividadId: string; asunto: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [resultado, setResultado] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function completar() {
    setError(null)
    setGuardando(true)
    try {
      const res = await fetch('/api/crm/actividades', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: actividadId, accion: 'completar', resultado }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? `Error ${res.status}`)
      } else {
        setAbierto(false)
        router.refresh()
      }
    } catch (e) {
      setError((e as Error).message)
    }
    setGuardando(false)
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="rounded-md px-2 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50"
      >
        ✓ Completar
      </button>
      <Modal titulo={`Completar — ${asunto}`} abierto={abierto} onCerrar={() => setAbierto(false)}>
        <div>
          <label className={LABEL}>Resultado (opcional)</label>
          <input
            value={resultado}
            onChange={(e) => setResultado(e.target.value)}
            className={INPUT}
            placeholder="Se envió cotización; espera aprobación"
          />
        </div>
        {error && <p className={claseMensaje('error')}>{error}</p>}
        <div className="mt-4 flex justify-end">
          <button onClick={completar} disabled={guardando} className={BTN_PRIMARIO}>
            {guardando ? 'Guardando…' : 'Marcar completada'}
          </button>
        </div>
      </Modal>
    </>
  )
}
