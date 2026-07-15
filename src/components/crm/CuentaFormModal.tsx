'use client'

// Alta/edición de cuenta comercial (prospecto sin RFC). El RFC no existe aquí
// a propósito: eso es de ventas_cliente y se vincula al ganar/formalizar.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from './Modal'
import { LABEL, INPUT, SELECT, BTN_PRIMARIO, claseMensaje } from './ui'
import {
  ESTATUS_CUENTA_LABEL,
  TIPO_CUENTA_LABEL,
  nombreMiembro,
  type CuentaRow,
  type EstatusCuenta,
  type MiembroOrg,
  type TipoCuenta,
} from '@/lib/crm/tipos'

export default function CuentaFormModal({
  abierto,
  onCerrar,
  miembros,
  cuenta,
}: {
  abierto: boolean
  onCerrar: () => void
  miembros: MiembroOrg[]
  cuenta?: CuentaRow // presente = edición
}) {
  const router = useRouter()
  const [nombre, setNombre] = useState(cuenta?.nombre ?? '')
  const [nombreComercial, setNombreComercial] = useState(cuenta?.nombre_comercial ?? '')
  const [tipo, setTipo] = useState<TipoCuenta>(cuenta?.tipo ?? 'prospecto')
  const [estatus, setEstatus] = useState<EstatusCuenta>(cuenta?.estatus ?? 'activo')
  const [segmento, setSegmento] = useState(cuenta?.segmento ?? '')
  const [origen, setOrigen] = useState(cuenta?.origen ?? '')
  const [telefono, setTelefono] = useState(cuenta?.telefono ?? '')
  const [email, setEmail] = useState(cuenta?.email ?? '')
  const [sitioWeb, setSitioWeb] = useState(cuenta?.sitio_web ?? '')
  const [direccion, setDireccion] = useState(cuenta?.direccion ?? '')
  const [responsableId, setResponsableId] = useState(cuenta?.responsable_id ?? '')
  const [notas, setNotas] = useState(cuenta?.notas ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setError(null)
    setGuardando(true)
    try {
      const res = await fetch('/api/crm/cuentas', {
        method: cuenta ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(cuenta ? { id: cuenta.id } : {}),
          nombre,
          nombre_comercial: nombreComercial,
          tipo,
          estatus,
          segmento,
          origen,
          telefono,
          email,
          sitio_web: sitioWeb,
          direccion,
          responsable_id: responsableId || null,
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
    <Modal titulo={cuenta ? 'Editar cuenta' : 'Nueva cuenta'} abierto={abierto} onCerrar={onCerrar} ancho="max-w-2xl">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={LABEL}>Nombre *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT} placeholder="Comercializadora del Sureste" />
        </div>
        <div>
          <label className={LABEL}>Nombre comercial</label>
          <input value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Segmento</label>
          <input value={segmento} onChange={(e) => setSegmento(e.target.value)} className={INPUT} placeholder="Cafeterías, mayoreo, exportación…" />
        </div>
        <div>
          <label className={LABEL}>Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoCuenta)} className={SELECT}>
            {Object.entries(TIPO_CUENTA_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Estatus</label>
          <select value={estatus} onChange={(e) => setEstatus(e.target.value as EstatusCuenta)} className={SELECT}>
            {Object.entries(ESTATUS_CUENTA_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
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
          <label className={LABEL}>Sitio web</label>
          <input value={sitioWeb} onChange={(e) => setSitioWeb(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Origen</label>
          <input value={origen} onChange={(e) => setOrigen(e.target.value)} className={INPUT} placeholder="Feria, referido, redes…" />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Dirección / ubicación comercial</label>
          <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Responsable</label>
          <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className={SELECT}>
            <option value="">— Sin asignar —</option>
            {miembros.map((m) => (
              <option key={m.id} value={m.id}>{nombreMiembro(m)}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Notas</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={INPUT} />
        </div>
      </div>

      {error && <p className={claseMensaje('error')}>{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={guardar} disabled={!nombre.trim() || guardando} className={BTN_PRIMARIO}>
          {guardando ? 'Guardando…' : cuenta ? 'Guardar cambios' : 'Crear cuenta'}
        </button>
      </div>
    </Modal>
  )
}
