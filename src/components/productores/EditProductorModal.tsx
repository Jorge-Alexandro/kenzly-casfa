'use client'

// Edit form for a productor's catalog fields. PATCHes /api/productores/[id].
import { useState } from 'react'
import type { Productor } from '@/lib/types'

export default function EditProductorModal({
  productor,
  onClose,
  onSaved,
}: {
  productor: Productor
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(productor.nombre_completo)
  const [comunidad, setComunidad] = useState(productor.comunidad ?? '')
  const [municipio, setMunicipio] = useState(productor.municipio ?? '')
  const [sexo, setSexo] = useState(productor.sexo ?? '')
  const [anio, setAnio] = useState(
    productor.anio_ingreso ? String(productor.anio_ingreso) : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!nombre.trim()) {
      setError('El nombre es obligatorio')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/productores/${productor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_completo: nombre,
          comunidad,
          municipio,
          sexo,
          anio_ingreso: anio ? Number(anio) : null,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        throw new Error(b.error ?? `Error ${res.status}`)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Editar productor · ${productor.codigo}`} onClose={onClose}>
      <Field label="Nombre completo">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Comunidad">
          <input value={comunidad} onChange={(e) => setComunidad(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Municipio">
          <input value={municipio} onChange={(e) => setMunicipio(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Sexo">
          <input value={sexo} onChange={(e) => setSexo(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Año de ingreso">
          <input
            type="number"
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <ModalActions busy={busy} onClose={onClose} onSave={save} />
    </Modal>
  )
}

// --- shared modal bits (kept local to avoid premature abstraction) ---
const inputCls =
  'w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400'

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="space-y-3 p-4">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  )
}

export function ModalActions({
  busy,
  onClose,
  onSave,
}: {
  busy: boolean
  onClose: () => void
  onSave: () => void
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
        Cancelar
      </button>
      <button
        disabled={busy}
        onClick={onSave}
        className="rounded-md bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {busy ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  )
}
