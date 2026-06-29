'use client'

// Edit form for a parcela's editable fields. PATCHes /api/parcelas/[id].
import { useState } from 'react'
import type { ParcelaDetalle } from '@/lib/types'
import { Modal, Field, ModalActions } from './EditProductorModal'

const inputCls =
  'w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400'

export default function EditParcelaModal({
  parcela,
  onClose,
  onSaved,
}: {
  parcela: ParcelaDetalle
  onClose: () => void
  onSaved: () => void
}) {
  const [nombre, setNombre] = useState(parcela.nombre ?? '')
  const [comunidad, setComunidad] = useState(parcela.comunidad ?? '')
  const [municipio, setMunicipio] = useState(parcela.municipio ?? '')
  const [superficie, setSuperficie] = useState(
    parcela.superficie_declarada_ha !== null
      ? String(parcela.superficie_declarada_ha)
      : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    // Validate the surface client-side before the round-trip.
    if (superficie.trim() && !(Number(superficie) >= 0)) {
      setError('La superficie debe ser un número ≥ 0')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/parcelas/${parcela.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          comunidad,
          municipio,
          superficie_declarada_ha: superficie.trim() ? Number(superficie) : null,
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
    <Modal title={`Editar parcela · ${parcela.codigo_parcela}`} onClose={onClose}>
      <Field label="Nombre de la parcela">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Comunidad">
          <input value={comunidad} onChange={(e) => setComunidad(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Municipio">
          <input value={municipio} onChange={(e) => setMunicipio(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="Superficie declarada (ha)">
        <input
          type="number"
          step="0.01"
          min="0"
          value={superficie}
          onChange={(e) => setSuperficie(e.target.value)}
          className={inputCls}
        />
      </Field>
      <p className="text-xs text-slate-400">
        La superficie declarada es la base de comparación contra el área medida
        del polígono en GeoSIC.
      </p>

      {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <ModalActions busy={busy} onClose={onClose} onSave={save} />
    </Modal>
  )
}
