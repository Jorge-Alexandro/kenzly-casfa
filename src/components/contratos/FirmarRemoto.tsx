'use client'

// Firma del vendedor en la liga remota (celular). Firma con el dedo y envía;
// no necesita cuenta. Al enviar, el contrato queda con su firma.
import { useState } from 'react'
import SignaturePad from '@/components/fichas/SignaturePad'

export default function FirmarRemoto({
  token,
  vendedorNombre,
  yaFirmado,
}: {
  token: string
  vendedorNombre: string
  yaFirmado: boolean
}) {
  const [firma, setFirma] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(yaFirmado)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    setError(null)
    if (!firma) return setError('Firma en el recuadro antes de enviar.')
    setEnviando(true)
    try {
      const res = await fetch(`/api/firmar/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firma }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo enviar la firma')
      setListo(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setEnviando(false)
    }
  }

  if (listo) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="text-3xl">✓</div>
        <p className="mt-2 font-semibold text-emerald-800">¡Firma recibida!</p>
        <p className="mt-1 text-sm text-emerald-700">
          Gracias, {vendedorNombre}. Tu firma quedó registrada en el contrato. Ya puedes cerrar
          esta página.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold text-slate-800">Firma aquí, {vendedorNombre}</h2>
      <p className="mb-3 text-xs text-slate-500">Firma con el dedo en el recuadro.</p>
      <SignaturePad value={firma} onChange={setFirma} />

      {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <button
        onClick={enviar}
        disabled={enviando}
        className="mt-4 w-full rounded-md bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
      >
        {enviando ? 'Enviando…' : 'Firmar contrato'}
      </button>
    </div>
  )
}
