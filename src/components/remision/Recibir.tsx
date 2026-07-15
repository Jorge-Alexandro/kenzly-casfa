'use client'

// Recepción en el beneficio: se escanea saco por saco lo que REALMENTE bajó del
// camión, y lo que no aparezca queda registrado como faltante.
//
// El botón de recibir NO se bloquea cuando faltan sacos. Un faltante es un
// hecho, no un error de captura: el café se quedó en el camino y hay que
// registrarlo, no esconderlo hasta que "cuadre". Lo que sí se hace es
// advertirlo con toda claridad antes de confirmar.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Escaner from './Escaner'
import type { SacoRemision } from '@/lib/data/remision'

interface Props {
  remisionId: string
  folio: number
  sacos: SacoRemision[]
}

export default function Recibir({ remisionId, folio, sacos }: Props) {
  const router = useRouter()
  const [escaneados, setEscaneados] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esperados = sacos.map((s) => s.codigo)
  const faltantes = esperados.filter((c) => !escaneados.includes(c))

  async function recibir() {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(`/api/remisiones/${remisionId}/recibir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etiquetas: escaneados }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`)
      router.push(`/acopio/${json.entrada_id}`)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Recibir en báscula</h2>
          <p className="text-sm tabular-nums text-slate-600">
            <span className="font-semibold text-orange-700">{escaneados.length}</span> de{' '}
            {esperados.length} sacos
          </p>
        </div>

        <Escaner
          yaEscaneados={escaneados}
          onCodigo={(c) => {
            if (!esperados.includes(c)) {
              setError(`La etiqueta ${c} no es de la remisión R-${folio}.`)
              return
            }
            setError(null)
            setEscaneados((prev) => [...prev, c])
          }}
        />
      </div>

      {faltantes.length > 0 && escaneados.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            Faltan {faltantes.length} saco{faltantes.length === 1 ? '' : 's'} por escanear
          </p>
          <p className="mt-1 font-mono text-xs text-red-700">{faltantes.join(', ')}</p>
          <p className="mt-2 text-xs text-red-600">
            Si de verdad no llegaron, puedes recibir así: quedarán registrados como faltantes del
            traslado.
          </p>
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        onClick={recibir}
        disabled={guardando || escaneados.length === 0}
        className="w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-40"
      >
        {guardando
          ? 'Abriendo boleta…'
          : faltantes.length > 0
            ? `Recibir ${escaneados.length} sacos (faltan ${faltantes.length}) y abrir boleta`
            : `Recibir los ${escaneados.length} sacos y abrir boleta`}
      </button>
    </div>
  )
}
