'use client'

// Una tarjeta plegable por plantilla: edita el texto fijo de un tipo de taller.
import { useState } from 'react'
import type { PlantillaTaller } from '@/lib/data/agro-talleres'

const INPUT = 'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800'
const TEXTAREA = `${INPUT} font-mono text-xs leading-relaxed`

type Plantilla = PlantillaTaller & { tipo_nombre: string; programa_nombre: string }

export default function PlantillaEditor({ plantilla }: { plantilla: Plantilla }) {
  const [abierto, setAbierto] = useState(false)
  const [nombreTaller, setNombreTaller] = useState(plantilla.nombre_taller)
  const [participantes, setParticipantes] = useState(plantilla.participantes ?? '')
  const [asesores, setAsesores] = useState(plantilla.asesores ?? '')
  const [introduccion, setIntroduccion] = useState(plantilla.introduccion ?? '')
  const [objetivoGeneral, setObjetivoGeneral] = useState(plantilla.objetivo_general ?? '')
  const [objetivosEspecificos, setObjetivosEspecificos] = useState(plantilla.objetivos_especificos.join('\n'))
  const [fichaDescriptiva, setFichaDescriptiva] = useState(plantilla.ficha_descriptiva.join('\n'))
  const [desarrollo, setDesarrollo] = useState(plantilla.desarrollo ?? '')
  const [acuerdos, setAcuerdos] = useState(plantilla.acuerdos ?? '')
  const [conclusiones, setConclusiones] = useState(plantilla.conclusiones ?? '')

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function guardar() {
    setError(null)
    setOk(false)
    if (!nombreTaller.trim()) return setError('El nombre del taller no puede quedar vacío.')
    setGuardando(true)
    try {
      const res = await fetch(`/api/agroecologia/plantillas/${plantilla.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_taller: nombreTaller,
          participantes,
          asesores,
          introduccion,
          objetivo_general: objetivoGeneral,
          objetivos_especificos: objetivosEspecificos.split('\n').map((s) => s.trim()).filter(Boolean),
          ficha_descriptiva: fichaDescriptiva.split('\n').map((s) => s.trim()).filter(Boolean),
          desarrollo,
          acuerdos,
          conclusiones,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      setOk(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span>
          <span className="text-sm font-semibold text-slate-800">{plantilla.nombre_taller}</span>
          <span className="ml-2 text-xs text-slate-400">{plantilla.programa_nombre} · {plantilla.tipo_nombre}</span>
        </span>
        <span className="text-slate-400">{abierto ? '▾' : '▸'}</span>
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-4">
          <Campo label="Nombre del taller (título del reporte)">
            <input value={nombreTaller} onChange={(e) => setNombreTaller(e.target.value)} className={INPUT} />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Participantes">
              <input value={participantes} onChange={(e) => setParticipantes(e.target.value)} className={INPUT} />
            </Campo>
            <Campo label="Asesores">
              <input value={asesores} onChange={(e) => setAsesores(e.target.value)} className={INPUT} />
            </Campo>
          </div>
          <Campo label="Introducción">
            <textarea value={introduccion} onChange={(e) => setIntroduccion(e.target.value)} rows={4} className={TEXTAREA} />
          </Campo>
          <Campo label="Objetivo general">
            <textarea value={objetivoGeneral} onChange={(e) => setObjetivoGeneral(e.target.value)} rows={2} className={TEXTAREA} />
          </Campo>
          <Campo label="Objetivos específicos (uno por línea)">
            <textarea value={objetivosEspecificos} onChange={(e) => setObjetivosEspecificos(e.target.value)} rows={4} className={TEXTAREA} />
          </Campo>
          <Campo label="Ficha descriptiva (una línea por renglón de la tabla)">
            <textarea value={fichaDescriptiva} onChange={(e) => setFichaDescriptiva(e.target.value)} rows={4} className={TEXTAREA} />
          </Campo>
          <Campo label="Desarrollo del taller">
            <textarea value={desarrollo} onChange={(e) => setDesarrollo(e.target.value)} rows={8} className={TEXTAREA} />
          </Campo>
          <Campo label="Acuerdos">
            <textarea value={acuerdos} onChange={(e) => setAcuerdos(e.target.value)} rows={3} className={TEXTAREA} />
          </Campo>
          <Campo label="Conclusiones">
            <textarea value={conclusiones} onChange={(e) => setConclusiones(e.target.value)} rows={3} className={TEXTAREA} />
          </Campo>

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Guardado.</p>}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-slate-500">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  )
}
