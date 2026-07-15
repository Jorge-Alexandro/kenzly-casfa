'use client'

// Cambio de etapa de una oportunidad (control accesible, sin drag-and-drop).
// - Perdido: exige motivo (el servidor y la BD también lo exigen).
// - Ganado: NO crea ninguna venta; si la cuenta aún no tiene cliente fiscal,
//   ofrece vincular uno existente o crear uno nuevo con RFC (o dejarlo para
//   después). La venta/CFDI se registra en el módulo Ventas como siempre.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from './Modal'
import { LABEL, INPUT, SELECT, BTN_PRIMARIO, claseMensaje } from './ui'
import {
  ETAPAS,
  ETAPA_LABEL,
  PROBABILIDAD_SUGERIDA,
  type EtapaOportunidad,
} from '@/lib/crm/tipos'

export interface ClienteFiscalOpcion {
  id: string
  rfc: string
  nombre: string
}

export default function CambiarEtapaModal({
  abierto,
  onCerrar,
  oportunidad,
  cuentaVinculada,
  clientesFiscales,
}: {
  abierto: boolean
  onCerrar: () => void
  oportunidad: { id: string; nombre: string; etapa: EtapaOportunidad }
  cuentaVinculada: boolean // la cuenta ya tiene ventas_cliente_id
  clientesFiscales: ClienteFiscalOpcion[]
}) {
  const router = useRouter()
  const [etapa, setEtapa] = useState<EtapaOportunidad>(oportunidad.etapa)
  const [motivo, setMotivo] = useState('')
  const [modoCliente, setModoCliente] = useState<'omitir' | 'vincular' | 'crear'>('omitir')
  const [clienteId, setClienteId] = useState('')
  const [rfc, setRfc] = useState('')
  const [nombreFiscal, setNombreFiscal] = useState('')
  const [regimen, setRegimen] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esPerdido = etapa === 'perdido'
  const esGanado = etapa === 'ganado'
  const pideVinculo = esGanado && !cuentaVinculada

  async function guardar() {
    setError(null)
    setGuardando(true)
    try {
      const body: Record<string, unknown> = {
        oportunidad_id: oportunidad.id,
        etapa,
        motivo_perdida: esPerdido ? motivo : undefined,
      }
      if (pideVinculo && modoCliente === 'vincular' && clienteId) {
        body.ventas_cliente = { cliente_id: clienteId }
      } else if (pideVinculo && modoCliente === 'crear') {
        body.ventas_cliente = { rfc, nombre: nombreFiscal, regimen_fiscal: regimen }
      }
      const res = await fetch('/api/crm/oportunidades/etapa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    etapa !== oportunidad.etapa &&
    (!esPerdido || motivo.trim() !== '') &&
    (!pideVinculo || modoCliente === 'omitir' ||
      (modoCliente === 'vincular' && clienteId !== '') ||
      (modoCliente === 'crear' && rfc.trim().length >= 12 && nombreFiscal.trim() !== '')) &&
    !guardando

  return (
    <Modal titulo={`Cambiar etapa — ${oportunidad.nombre}`} abierto={abierto} onCerrar={onCerrar}>
      <div className="space-y-4">
        <div>
          <label className={LABEL}>Nueva etapa</label>
          <select value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaOportunidad)} className={SELECT}>
            {ETAPAS.map((e) => (
              <option key={e} value={e}>
                {ETAPA_LABEL[e]} {e === oportunidad.etapa ? '(actual)' : ''}
              </option>
            ))}
          </select>
          {etapa !== oportunidad.etapa && !esGanado && !esPerdido && (
            <p className="mt-1.5 text-xs text-slate-500">
              La probabilidad se ajustará a {PROBABILIDAD_SUGERIDA[etapa]}% (sugerida para esta etapa); puedes editarla después.
            </p>
          )}
        </div>

        {esPerdido && (
          <div>
            <label className={LABEL}>Motivo de la pérdida *</label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              className={INPUT}
              placeholder="Precio, tiempos de entrega, eligió otro proveedor…"
            />
          </div>
        )}

        {esGanado && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="text-sm font-medium text-emerald-800">Oportunidad ganada 🎉</p>
            <p className="mt-1 text-xs text-emerald-700">
              Esto NO registra ninguna venta. La operación real (factura/CFDI o captura manual)
              se registra en el módulo Ventas, como siempre.
            </p>
            {pideVinculo && (
              <div className="mt-3 space-y-2">
                <p className={LABEL}>Cliente fiscal de la cuenta</p>
                <div className="flex flex-wrap gap-3 text-sm text-slate-700">
                  {([
                    ['omitir', 'Después'],
                    ['vincular', 'Vincular existente'],
                    ['crear', 'Crear nuevo (RFC)'],
                  ] as const).map(([v, l]) => (
                    <label key={v} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="modo-cliente"
                        checked={modoCliente === v}
                        onChange={() => setModoCliente(v)}
                        className="h-4 w-4 border-slate-300 text-orange-600 focus:ring-orange-500"
                      />
                      {l}
                    </label>
                  ))}
                </div>
                {modoCliente === 'vincular' && (
                  <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={SELECT}>
                    <option value="">— Elegir cliente fiscal —</option>
                    {clientesFiscales.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre} · {c.rfc}</option>
                    ))}
                  </select>
                )}
                {modoCliente === 'crear' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} className={INPUT} placeholder="RFC (12–13 caracteres)" maxLength={13} />
                    <input value={nombreFiscal} onChange={(e) => setNombreFiscal(e.target.value)} className={INPUT} placeholder="Razón social" />
                    <input value={regimen} onChange={(e) => setRegimen(e.target.value)} className={`${INPUT} sm:col-span-2`} placeholder="Régimen fiscal (opcional)" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className={claseMensaje('error')}>{error}</p>}

        <div className="flex justify-end">
          <button onClick={guardar} disabled={!puedeGuardar} className={BTN_PRIMARIO}>
            {guardando ? 'Guardando…' : 'Cambiar etapa'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
