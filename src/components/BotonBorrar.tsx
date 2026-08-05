'use client'

// Botón de borrar reutilizable para lo que se captura (ventas, requisiciones,
// CRM…). Pide confirmación explícita nombrando lo que se va a borrar — no un
// "¿estás seguro?" genérico — porque quien lo usa suele estar corrigiendo una
// captura equivocada y necesita ver QUÉ está a punto de desaparecer.
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function BotonBorrar({
  url,
  descripcion,
  advertencia,
  etiqueta = 'Borrar',
  redirigirA,
}: {
  /** endpoint DELETE completo, ej. `/api/ventas/pedidos/abc` */
  url: string
  /** qué es, para la confirmación: "la venta de Café Sabinas del 2026-08-04" */
  descripcion: string
  /** consecuencia extra que el usuario debe saber antes de confirmar */
  advertencia?: string
  etiqueta?: string
  /** si se borra el registro que la página actual muestra (ej. una ficha), a dónde navegar en vez de sólo refrescar */
  redirigirA?: string
}) {
  const router = useRouter()
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function borrar() {
    const msg = `¿Borrar ${descripcion}?` + (advertencia ? `\n\n${advertencia}` : '') + '\n\nEsto no se puede deshacer.'
    if (!confirm(msg)) return
    setError(null)
    setBorrando(true)
    try {
      const res = await fetch(url, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'No se pudo borrar')
      if (redirigirA) router.push(redirigirA)
      else router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al borrar')
    } finally {
      setBorrando(false)
    }
  }

  return (
    <>
      <button
        onClick={borrar}
        disabled={borrando}
        className="text-xs font-medium text-rose-600 transition hover:text-rose-800 disabled:opacity-50"
      >
        {borrando ? '…' : etiqueta}
      </button>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </>
  )
}
