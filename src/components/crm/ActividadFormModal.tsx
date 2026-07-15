'use client'

// Registrar actividad (llamada/visita/correo/whatsapp/tarea/nota) sobre una
// cuenta u oportunidad. Las notas quedan completadas al guardarse; el resto
// son pendientes con fecha programada opcional.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from './Modal'
import { LABEL, INPUT, SELECT, BTN_PRIMARIO, claseMensaje } from './ui'
import {
  TIPO_ACTIVIDAD_LABEL,
  nombreMiembro,
  type MiembroOrg,
  type TipoActividad,
} from '@/lib/crm/tipos'

export default function ActividadFormModal({
  abierto,
  onCerrar,
  cuentaId,
  oportunidades,
  oportunidadFija,
  miembros,
}: {
  abierto: boolean
  onCerrar: () => void
  cuentaId: string
  oportunidades: { id: string; nombre: string }[]
  oportunidadFija?: string
  miembros: MiembroOrg[]
}) {
  const router = useRouter()
  const [tipo, setTipo] = useState<TipoActividad>('llamada')
  const [asunto, setAsunto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fechaProgramada, setFechaProgramada] = useState('')
  const [oportunidadId, setOportunidadId] = useState(oportunidadFija ?? '')
  const [responsableId, setResponsableId] = useState('')
  const [completada, setCompletada] = useState(false)
  const [resultado, setResultado] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esNota = tipo === 'nota'

  async function guardar() {
    setError(null)
    setGuardando(true)
    try {
      const res = await fetch('/api/crm/actividades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cuenta_id: cuentaId,
          oportunidad_id: oportunidadId || null,
          tipo,
          asunto,
          descripcion,
          fecha_programada: fechaProgramada || null,
          completada: esNota || completada,
          resultado: esNota || completada ? resultado : null,
          responsable_id: responsableId || null,
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
    <Modal titulo="Registrar actividad" abierto={abierto} onCerrar={onCerrar}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL}>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoActividad)} className={SELECT}>
            {Object.entries(TIPO_ACTIVIDAD_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Oportunidad (opcional)</label>
          <select
            value={oportunidadId}
            onChange={(e) => setOportunidadId(e.target.value)}
            className={SELECT}
            disabled={Boolean(oportunidadFija)}
          >
            <option value="">— Solo la cuenta —</option>
            {oportunidades.map((o) => (
              <option key={o.id} value={o.id}>{o.nombre}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Asunto *</label>
          <input value={asunto} onChange={(e) => setAsunto(e.target.value)} className={INPUT} placeholder="Llamar para dar seguimiento a la cotización" />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Descripción</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className={INPUT} />
        </div>
        {!esNota && (
          <>
            <div>
              <label className={LABEL}>Fecha programada</label>
              <input type="datetime-local" value={fechaProgramada} onChange={(e) => setFechaProgramada(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Responsable</label>
              <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className={SELECT}>
                <option value="">— Yo —</option>
                {miembros.map((m) => (
                  <option key={m.id} value={m.id}>{nombreMiembro(m)}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={completada}
                onChange={(e) => setCompletada(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
              />
              Ya se realizó (registrar como completada)
            </label>
          </>
        )}
        {(esNota || completada) && (
          <div className="sm:col-span-2">
            <label className={LABEL}>Resultado</label>
            <input value={resultado} onChange={(e) => setResultado(e.target.value)} className={INPUT} placeholder="Interesado; pide muestra de 5 kg" />
          </div>
        )}
      </div>

      {error && <p className={claseMensaje('error')}>{error}</p>}

      <div className="mt-4 flex justify-end">
        <button onClick={guardar} disabled={!asunto.trim() || guardando} className={BTN_PRIMARIO}>
          {guardando ? 'Guardando…' : 'Registrar'}
        </button>
      </div>
    </Modal>
  )
}
