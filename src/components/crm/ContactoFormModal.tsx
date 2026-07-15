'use client'

// Alta/edición de contacto de una cuenta. "Principal" des-marca al anterior
// (regla en el API; la BD lo garantiza con índice único parcial).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from './Modal'
import { LABEL, INPUT, BTN_PRIMARIO, claseMensaje } from './ui'
import type { ContactoRow } from '@/lib/crm/tipos'

export default function ContactoFormModal({
  abierto,
  onCerrar,
  cuentaId,
  contacto,
}: {
  abierto: boolean
  onCerrar: () => void
  cuentaId: string
  contacto?: ContactoRow // presente = edición
}) {
  const router = useRouter()
  const [nombre, setNombre] = useState(contacto?.nombre ?? '')
  const [puesto, setPuesto] = useState(contacto?.puesto ?? '')
  const [telefono, setTelefono] = useState(contacto?.telefono ?? '')
  const [email, setEmail] = useState(contacto?.email ?? '')
  const [whatsapp, setWhatsapp] = useState(contacto?.whatsapp ?? '')
  const [principal, setPrincipal] = useState(contacto?.principal ?? false)
  const [notas, setNotas] = useState(contacto?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setError(null)
    setGuardando(true)
    try {
      const res = await fetch('/api/crm/contactos', {
        method: contacto ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(contacto ? { id: contacto.id } : { cuenta_id: cuentaId }),
          nombre,
          puesto,
          telefono,
          email,
          whatsapp,
          principal,
          notas,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? `Error ${res.status}`)
      } else {
        onCerrar()
        router.refresh()
      }
    } catch (e) {
      setError((e as Error).message)
    }
    setGuardando(false)
  }

  return (
    <Modal titulo={contacto ? 'Editar contacto' : 'Nuevo contacto'} abierto={abierto} onCerrar={onCerrar}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={LABEL}>Nombre *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Puesto</label>
          <input value={puesto} onChange={(e) => setPuesto(e.target.value)} className={INPUT} placeholder="Compras, gerente…" />
        </div>
        <div>
          <label className={LABEL}>Teléfono</label>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Correo</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>WhatsApp</label>
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={INPUT} />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Notas</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={INPUT} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={principal}
            onChange={(e) => setPrincipal(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
          />
          Contacto principal de la cuenta
        </label>
      </div>

      {error && <p className={claseMensaje('error')}>{error}</p>}

      <div className="mt-4 flex justify-end">
        <button onClick={guardar} disabled={!nombre.trim() || guardando} className={BTN_PRIMARIO}>
          {guardando ? 'Guardando…' : contacto ? 'Guardar cambios' : 'Agregar contacto'}
        </button>
      </div>
    </Modal>
  )
}
