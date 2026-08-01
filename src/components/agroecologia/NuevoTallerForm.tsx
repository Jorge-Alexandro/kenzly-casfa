'use client'

// Captura de un taller: comunidad, fecha, horas y técnico. El contenido del
// reporte (introducción, objetivos, desarrollo…) ya vive en la plantilla del
// tipo — este formulario NO lo toca.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ProgramaLite } from '@/lib/data/agroecologia'
import type { ComunidadPicker, TipoTallerPicker } from '@/lib/data/agro-talleres'

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const hoy = () => new Date().toISOString().slice(0, 10)

export default function NuevoTallerForm({
  programas,
  porPrograma,
}: {
  programas: ProgramaLite[]
  porPrograma: { programaId: string; tipos: TipoTallerPicker[]; comunidades: ComunidadPicker[] }[]
}) {
  const router = useRouter()
  const [programaId, setProgramaId] = useState(programas[0]?.id ?? '')
  const catalogo = porPrograma.find((p) => p.programaId === programaId)
  const tipos = catalogo?.tipos ?? []
  const comunidades = catalogo?.comunidades ?? []

  const [tipoTallerId, setTipoTallerId] = useState('')
  const [comunidadId, setComunidadId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [nuevaComunidad, setNuevaComunidad] = useState(false)
  const [comunidadTexto, setComunidadTexto] = useState('')
  const [municipioTexto, setMunicipioTexto] = useState('')

  const [fecha, setFecha] = useState(hoy())
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [tecnico, setTecnico] = useState('')
  const [notas, setNotas] = useState('')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const candidatas = useMemo(() => {
    const q = norm(busqueda)
    if (!q) return comunidades.slice(0, 30)
    return comunidades.filter((c) => norm(`${c.comunidad} ${c.municipio ?? ''}`).includes(q)).slice(0, 30)
  }, [comunidades, busqueda])

  const comunidadSel = comunidades.find((c) => c.id === comunidadId)

  function cambiarPrograma(id: string) {
    setProgramaId(id)
    setTipoTallerId('')
    setComunidadId('')
    setBusqueda('')
    setNuevaComunidad(false)
  }

  async function guardar() {
    setError(null)
    if (!tipoTallerId) return setError('Elige el tipo de taller.')
    if (!nuevaComunidad && !comunidadId) return setError('Elige la comunidad, o marca "no está en la lista".')
    if (nuevaComunidad && !comunidadTexto.trim()) return setError('Escribe el nombre de la comunidad.')
    if (!fecha) return setError('Falta la fecha.')

    setGuardando(true)
    try {
      const res = await fetch('/api/agroecologia/talleres', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programa_id: programaId,
          tipo_taller_id: tipoTallerId,
          comunidad_id: nuevaComunidad ? null : comunidadId,
          comunidad: nuevaComunidad ? comunidadTexto : undefined,
          municipio: nuevaComunidad ? municipioTexto : undefined,
          fecha,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          tecnico,
          notas,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar el taller')
      router.push(`/agroecologia/talleres/${data.id}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Programa">
          <select value={programaId} onChange={(e) => cambiarPrograma(e.target.value)} className={INPUT}>
            {programas.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} {p.ciclo}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Tipo de taller">
          <select value={tipoTallerId} onChange={(e) => setTipoTallerId(e.target.value)} className={INPUT}>
            <option value="">Elegir…</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </Campo>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-slate-500">Comunidad</span>
          <button
            type="button"
            onClick={() => { setNuevaComunidad((v) => !v); setComunidadId('') }}
            className="text-xs text-orange-700 hover:underline"
          >
            {nuevaComunidad ? 'Elegir del catálogo' : 'No está en la lista'}
          </button>
        </div>

        {nuevaComunidad ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <input placeholder="Nombre de la comunidad *" value={comunidadTexto}
              onChange={(e) => setComunidadTexto(e.target.value)} className={INPUT} />
            <input placeholder="Municipio" value={municipioTexto}
              onChange={(e) => setMunicipioTexto(e.target.value)} className={INPUT} />
          </div>
        ) : (
          <>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar comunidad…"
              className={`${INPUT} mb-1.5`}
            />
            <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200">
              {candidatas.map((c) => {
                const sel = c.id === comunidadId
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setComunidadId(c.id)}
                    className={`block w-full px-3 py-1.5 text-left text-sm ${sel ? 'bg-orange-600 text-white' : 'text-slate-700 hover:bg-orange-50'}`}
                  >
                    {c.comunidad}
                    {c.municipio && <span className={sel ? 'text-orange-100' : 'text-slate-400'}> · {c.municipio}</span>}
                  </button>
                )
              })}
              {candidatas.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-slate-400">Ninguna coincide.</p>
              )}
            </div>
            {comunidadSel && (
              <p className="mt-1 text-xs text-slate-500">Seleccionado: {comunidadSel.comunidad} · {comunidadSel.socios} socios</p>
            )}
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo label="Fecha">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INPUT} />
        </Campo>
        <Campo label="Hora de inicio">
          <input placeholder="09:00 am" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className={INPUT} />
        </Campo>
        <Campo label="Hora de cierre">
          <input placeholder="10:30 am" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className={INPUT} />
        </Campo>
      </div>

      <Campo label="Técnico que lo impartió">
        <input placeholder="Ing. …" value={tecnico} onChange={(e) => setTecnico(e.target.value)} className={INPUT} />
      </Campo>

      <Campo label="Notas del día (opcional)">
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={3}
          placeholder="Cualquier cosa particular de esta reunión que no esté en la plantilla…"
          className={INPUT}
        />
      </Campo>

      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="rounded-md bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar taller'}
        </button>
      </div>
    </div>
  )
}

const INPUT = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-slate-500">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  )
}
