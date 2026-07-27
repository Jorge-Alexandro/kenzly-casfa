'use client'

// Registro de asistencia EN VIVO: al llegar, cada quien se registra en el mismo
// dispositivo (se pasa la tablet) y todos aparecen en la misma lista. "Descargar
// PDF" imprime el formato con folio, listo para archivar. La firma se captura
// con el mismo pad de las fichas.
import { useState } from 'react'
import Link from 'next/link'
import SignaturePad from '@/components/fichas/SignaturePad'
import type { AsistenciaListaDetalle, AsistenciaRegistro } from '@/lib/data/asistencia'

const VACIO = {
  nombre_completo: '',
  organizacion: '',
  sexo: '',
  cargo: '',
  telefono: '',
  correo: '',
  firma_url: null as string | null,
}

export default function ListaAsistenciaCliente({ lista }: { lista: AsistenciaListaDetalle }) {
  const [registros, setRegistros] = useState<AsistenciaRegistro[]>(lista.registros)
  const [form, setForm] = useState({ ...VACIO })
  const [abierto, setAbierto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function registrar() {
    if (!form.nombre_completo.trim()) return setError('Escribe el nombre.')
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/asistencia/${lista.id}/registro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo registrar')
      setRegistros((rs) => [...rs, data.registro])
      setForm({ ...VACIO })
      setAbierto(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-slate-100">
      {/* Barra (no se imprime) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-6 py-3">
        <Link href="/asistencia" className="text-sm text-slate-500 hover:text-slate-700">
          ← Listas
        </Link>
        <div className="flex items-center gap-2">
          {!lista.cerrada && (
            <button
              onClick={() => setAbierto((v) => !v)}
              className="rounded-md bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
            >
              + Registrar asistencia
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="rounded-md border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Descargar PDF
          </button>
        </div>
      </div>

      {/* Formulario de registro (no se imprime) */}
      {abierto && !lista.cerrada && (
        <div className="no-print border-b border-slate-200 bg-white px-6 py-4">
          <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
            <Campo label="Nombre completo *">
              <input value={form.nombre_completo} onChange={(e) => set('nombre_completo', e.target.value)} className={inp} />
            </Campo>
            <Campo label="Organización que representa">
              <input value={form.organizacion} onChange={(e) => set('organizacion', e.target.value)} className={inp} />
            </Campo>
            <Campo label="Sexo">
              <select value={form.sexo} onChange={(e) => set('sexo', e.target.value)} className={inp}>
                <option value="">—</option>
                <option value="M">Mujer</option>
                <option value="H">Hombre</option>
              </select>
            </Campo>
            <Campo label="Cargo">
              <input value={form.cargo} onChange={(e) => set('cargo', e.target.value)} className={inp} />
            </Campo>
            <Campo label="Teléfono">
              <input value={form.telefono} onChange={(e) => set('telefono', e.target.value)} className={inp} />
            </Campo>
            <Campo label="Correo electrónico">
              <input value={form.correo} onChange={(e) => set('correo', e.target.value)} className={inp} />
            </Campo>
            <div className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Firma</span>
              <SignaturePad value={form.firma_url} onChange={(v) => set('firma_url', v)} />
            </div>
          </div>
          {error && <p className="mx-auto mt-2 max-w-3xl text-sm text-rose-700">{error}</p>}
          <div className="mx-auto mt-3 flex max-w-3xl justify-end gap-2">
            <button onClick={() => setAbierto(false)} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Cancelar
            </button>
            <button
              onClick={registrar}
              disabled={busy}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {busy ? 'Registrando…' : 'Agregar a la lista'}
            </button>
          </div>
        </div>
      )}

      {/* Hoja imprimible */}
      <div className="print-sheet mx-auto my-6 max-w-4xl bg-white p-10 text-[13px] text-slate-800 shadow-sm">
        <div className="mb-4 flex items-start justify-between border-b border-slate-300 pb-3">
          <div>
            <h1 className="text-base font-bold uppercase text-slate-900">Lista de asistencia</h1>
            <p className="mt-1 text-sm">
              <strong>Evento:</strong> {lista.nombre_evento}
            </p>
            <p className="text-sm">
              <strong>Lugar:</strong> {lista.lugar || '—'} · <strong>Capacitador:</strong>{' '}
              {lista.capacitador || '—'}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="text-lg font-bold text-slate-900">Folio #{lista.folio}</p>
            <p><strong>Fecha:</strong> {lista.fecha}</p>
            <p className="text-slate-500">{registros.length} participante(s)</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-left">
                <Th>No.</Th>
                <Th>Nombre completo</Th>
                <Th>Organización</Th>
                <Th>Sexo</Th>
                <Th>Cargo</Th>
                <Th>Teléfono</Th>
                <Th>Correo</Th>
                <Th>Firma</Th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id} className="border-t border-slate-200">
                  <Td>{r.numero}</Td>
                  <Td>{r.nombre_completo}</Td>
                  <Td>{r.organizacion || '—'}</Td>
                  <Td>{r.sexo || '—'}</Td>
                  <Td>{r.cargo || '—'}</Td>
                  <Td>{r.telefono || '—'}</Td>
                  <Td>{r.correo || '—'}</Td>
                  <Td>
                    {r.firma_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.firma_url} alt="firma" className="h-8 object-contain" />
                    ) : (
                      '—'
                    )}
                  </Td>
                </tr>
              ))}
              {registros.length === 0 && (
                <tr>
                  <td colSpan={8} className="border-t border-slate-200 px-2 py-6 text-center text-slate-400">
                    Aún no hay participantes registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const inp = 'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  )
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="border border-slate-300 px-2 py-1.5 font-semibold">{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="border border-slate-200 px-2 py-1.5">{children}</td>
}
