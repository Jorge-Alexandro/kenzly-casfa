'use client'

// Modal ligero compartido por los formularios del CRM (sin dependencias).
// Overlay + panel centrado; en celular ocupa casi todo el ancho.
import { useEffect } from 'react'

export default function Modal({
  titulo,
  abierto,
  onCerrar,
  children,
  ancho = 'max-w-lg',
}: {
  titulo: string
  abierto: boolean
  onCerrar: () => void
  children: React.ReactNode
  ancho?: string
}) {
  // Esc cierra; bloquea el scroll del fondo mientras está abierto.
  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className={`max-h-[90vh] w-full ${ancho} overflow-auto rounded-xl bg-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>
          <button
            onClick={onCerrar}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
