'use client'

// Botón de edición de un contacto (abre el mismo formulario del alta).
import { useState } from 'react'
import ContactoFormModal from './ContactoFormModal'
import type { ContactoRow } from '@/lib/crm/tipos'

export default function ContactoEditarBoton({ contacto }: { contacto: ContactoRow }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
      >
        Editar
      </button>
      {abierto && (
        <ContactoFormModal abierto onCerrar={() => setAbierto(false)} cuentaId={contacto.cuenta_id} contacto={contacto} />
      )}
    </>
  )
}
