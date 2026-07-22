'use client'

// Botón para borrar un contrato. Pide escribir el folio para confirmar (borrar
// es irreversible y se lleva las firmas). Sólo se muestra a un supervisor.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { folioContrato } from '@/lib/contratos/tipos'

export default function BorrarContrato({ id, folio }: { id: string; folio: number }) {
  const router = useRouter()
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function borrar() {
    const escrito = prompt(
      `Esto borra ${folioContrato(folio)} y sus firmas. No se puede deshacer.\n\n` +
        `Escribe el folio (${folio}) para confirmar:`,
    )
    if (escrito == null) return
    if (escrito.trim() !== String(folio)) {
      return setError('El folio no coincide. No se borró nada.')
    }
    setError(null)
    setBorrando(true)
    try {
      const res = await fetch(`/api/contratos/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo borrar')
      router.push('/contratos')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
      setBorrando(false)
    }
  }

  return (
    <>
      <button
        onClick={borrar}
        disabled={borrando}
        className="rounded-md border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
      >
        {borrando ? 'Borrando…' : 'Borrar'}
      </button>
      {error && (
        <span className="text-xs text-rose-600" role="alert">
          {error}
        </span>
      )}
    </>
  )
}
