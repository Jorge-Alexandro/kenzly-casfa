'use client'

// Vincular la cuenta CRM con su cliente fiscal (ventas_cliente): elegir uno
// existente o crear uno nuevo con RFC único por org. Habilita la ficha 360°
// con el historial real de Ventas. No crea ventas ni facturas.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from './Modal'
import { INPUT, LABEL, SELECT, BTN_PRIMARIO, claseMensaje } from './ui'
import type { ClienteFiscalOpcion } from './CambiarEtapaModal'

export default function VincularClienteModal({
  abierto,
  onCerrar,
  cuentaId,
  nombreCuenta,
  clientesFiscales,
}: {
  abierto: boolean
  onCerrar: () => void
  cuentaId: string
  nombreCuenta: string
  clientesFiscales: ClienteFiscalOpcion[]
}) {
  const router = useRouter()
  const [modo, setModo] = useState<'vincular' | 'crear'>('vincular')
  const [clienteId, setClienteId] = useState('')
  const [rfc, setRfc] = useState('')
  const [nombreFiscal, setNombreFiscal] = useState(nombreCuenta)
  const [regimen, setRegimen] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setError(null)
    setGuardando(true)
    try {
      const res = await fetch('/api/crm/cuentas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: cuentaId,
          accion: 'vincular_ventas_cliente',
          ...(modo === 'vincular'
            ? { cliente_id: clienteId }
            : { rfc, nombre_fiscal: nombreFiscal, regimen_fiscal: regimen }),
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

  const puedeGuardar =
    (modo === 'vincular' ? clienteId !== '' : rfc.trim().length >= 12 && nombreFiscal.trim() !== '') && !guardando

  return (
    <Modal titulo="Vincular cliente fiscal" abierto={abierto} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div className="flex gap-4 text-sm text-slate-700">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="modo-vinculo" checked={modo === 'vincular'} onChange={() => setModo('vincular')} className="h-4 w-4 border-slate-300 text-orange-600 focus:ring-orange-500" />
            Cliente existente
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="modo-vinculo" checked={modo === 'crear'} onChange={() => setModo('crear')} className="h-4 w-4 border-slate-300 text-orange-600 focus:ring-orange-500" />
            Crear nuevo con RFC
          </label>
        </div>

        {modo === 'vincular' ? (
          <div>
            <label className={LABEL}>Cliente fiscal</label>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={SELECT}>
              <option value="">— Elegir —</option>
              {clientesFiscales.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} · {c.rfc}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL}>RFC *</label>
              <input value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} maxLength={13} className={INPUT} placeholder="AET1809215E3" />
            </div>
            <div>
              <label className={LABEL}>Razón social *</label>
              <input value={nombreFiscal} onChange={(e) => setNombreFiscal(e.target.value)} className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Régimen fiscal</label>
              <input value={regimen} onChange={(e) => setRegimen(e.target.value)} className={INPUT} placeholder="601 — General de Ley (opcional)" />
            </div>
          </div>
        )}

        {error && <p className={claseMensaje('error')}>{error}</p>}

        <div className="flex justify-end">
          <button onClick={guardar} disabled={!puedeGuardar} className={BTN_PRIMARIO}>
            {guardando ? 'Guardando…' : 'Vincular'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
