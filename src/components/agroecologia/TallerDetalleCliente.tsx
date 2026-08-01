'use client'

// Detalle del taller: datos del evento (editables), fotos, enlace con la lista
// de asistencia con firmas, y una vista previa de lo que trae la plantilla.
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TallerDetalle } from '@/lib/data/agro-talleres'
import type { AsistenciaListaRow } from '@/lib/data/asistencia'

const INPUT = 'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800'

export default function TallerDetalleCliente({
  detalle, listas,
}: {
  detalle: TallerDetalle
  listas: AsistenciaListaRow[]
}) {
  const router = useRouter()
  const t = detalle.taller
  const [horaInicio, setHoraInicio] = useState(t.hora_inicio ?? '')
  const [horaFin, setHoraFin] = useState(t.hora_fin ?? '')
  const [tecnico, setTecnico] = useState(t.tecnico ?? '')
  const [notas, setNotas] = useState(t.notas ?? '')
  const [listaId, setListaId] = useState(t.lista_id ?? '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [verPlantilla, setVerPlantilla] = useState(false)

  async function guardar() {
    setError(null)
    setOk(false)
    setGuardando(true)
    try {
      const res = await fetch(`/api/agroecologia/talleres/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hora_inicio: horaInicio, hora_fin: horaFin, tecnico, notas, lista_id: listaId || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      setOk(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  // --- fotos --------------------------------------------------------------
  const [fotos, setFotos] = useState(detalle.fotos)
  const [subiendo, setSubiendo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function subirFotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setSubiendo(true)
    setError(null)
    try {
      const cargadas = await Promise.all(
        Array.from(files).map(
          (f) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result as string)
              reader.onerror = reject
              reader.readAsDataURL(f)
            }),
        ),
      )
      const res = await fetch(`/api/agroecologia/talleres/${t.id}/fotos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fotos: cargadas.map((dataUrl) => ({ dataUrl })) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron subir las fotos')
      setFotos((prev) => [...prev, ...data.fotos])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al subir fotos')
    } finally {
      setSubiendo(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function borrarFoto(id: string) {
    if (!confirm('¿Quitar esta foto del reporte?')) return
    const res = await fetch(`/api/agroecologia/talleres/${t.id}/fotos?id=${id}`, { method: 'DELETE' })
    if (!res.ok) return setError('No se pudo borrar la foto')
    setFotos((prev) => prev.filter((f) => f.id !== id))
  }

  return (
    <div className="space-y-4">
      {/* Datos del evento */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Datos del evento</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Hora de inicio</span>
            <input value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className={INPUT} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Hora de cierre</span>
            <input value={horaFin} onChange={(e) => setHoraFin(e.target.value)} className={INPUT} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Técnico</span>
            <input value={tecnico} onChange={(e) => setTecnico(e.target.value)} className={INPUT} />
          </label>
        </div>
        <label className="mt-3 block text-xs text-slate-500">
          <span className="mb-1 block">Notas del día</span>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className={INPUT} />
        </label>

        <label className="mt-3 block text-xs text-slate-500">
          <span className="mb-1 block">Lista de asistencia (firmas)</span>
          <select value={listaId} onChange={(e) => setListaId(e.target.value)} className={INPUT}>
            <option value="">Sin enlazar</option>
            {listas.map((l) => (
              <option key={l.id} value={l.id}>
                #{l.folio} · {l.nombre_evento} · {l.fecha} · {l.num_participantes} firmas
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-slate-400">
            Al enlazar una lista, el reporte trae la asistencia real (nombre, sexo) en vez de quedar en blanco.
          </span>
        </label>

        {error && <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {ok && <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Guardado.</p>}

        <div className="mt-3 flex justify-end">
          <button
            onClick={guardar}
            disabled={guardando}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </section>

      {/* Fotos */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Evidencias fotográficas ({fotos.length})</h2>
          <div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" multiple className="hidden"
              onChange={(e) => subirFotos(e.target.files)} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={subiendo}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {subiendo ? 'Subiendo…' : '+ Agregar fotos'}
            </button>
          </div>
        </div>
        {fotos.length === 0 ? (
          <p className="text-sm text-slate-400">Sin fotos todavía.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {fotos.map((f) => (
              <div key={f.id} className="group relative overflow-hidden rounded-md border border-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="" className="h-28 w-full object-cover" />
                <button
                  onClick={() => borrarFoto(f.id)}
                  className="absolute right-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-rose-600 opacity-0 group-hover:opacity-100"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Vista previa de la plantilla */}
      {detalle.plantilla && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <button
            type="button"
            onClick={() => setVerPlantilla((v) => !v)}
            className="text-sm font-semibold text-slate-800"
          >
            {verPlantilla ? '▾' : '▸'} Contenido del reporte (de la plantilla de {detalle.tipo_nombre})
          </button>
          {verPlantilla && (
            <div className="mt-3 space-y-3 text-sm text-slate-600">
              {detalle.plantilla.introduccion && (
                <div><p className="mb-1 text-xs font-semibold uppercase text-slate-400">Introducción</p><p>{detalle.plantilla.introduccion}</p></div>
              )}
              {detalle.plantilla.objetivo_general && (
                <div><p className="mb-1 text-xs font-semibold uppercase text-slate-400">Objetivo general</p><p>{detalle.plantilla.objetivo_general}</p></div>
              )}
              {detalle.plantilla.desarrollo && (
                <div><p className="mb-1 text-xs font-semibold uppercase text-slate-400">Desarrollo</p><p className="whitespace-pre-line">{detalle.plantilla.desarrollo}</p></div>
              )}
              {detalle.plantilla.acuerdos && (
                <div><p className="mb-1 text-xs font-semibold uppercase text-slate-400">Acuerdos</p><p>{detalle.plantilla.acuerdos}</p></div>
              )}
              {detalle.plantilla.conclusiones && (
                <div><p className="mb-1 text-xs font-semibold uppercase text-slate-400">Conclusiones</p><p>{detalle.plantilla.conclusiones}</p></div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
