'use client'

// Corregir datos del productor y sus parcelas DESDE la ficha, incluso sin señal.
// Los cambios se mandan (PATCH) si hay red, o se encolan y se suben solos.
import { useState } from 'react'
import type { ProductorLite, ParcelaLite } from '@/lib/types'
import { codigoCorto } from '@/lib/format'
import { enviarOEncolarEdicion } from '@/lib/offline/sync'

export default function EditarDatosCampo({
  productor,
  parcelas,
}: {
  productor: ProductorLite
  parcelas: ParcelaLite[]
}) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState(productor.nombre_completo)
  const [comunidad, setComunidad] = useState(productor.comunidad ?? '')
  const [municipio, setMunicipio] = useState(productor.municipio ?? '')
  const [parc, setParc] = useState(
    parcelas.map((p) => ({
      id: p.id,
      label: codigoCorto(p.codigo_parcela, p.nombre),
      nombre: p.nombre ?? '',
      superficie: p.superficie_declarada_ha != null ? String(p.superficie_declarada_ha) : '',
    })),
  )
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      let offline = false
      const rp = await enviarOEncolarEdicion(
        'productor',
        productor.id,
        {
          nombre_completo: nombre.trim(),
          comunidad: comunidad.trim() || null,
          municipio: municipio.trim() || null,
        },
        `Datos de ${nombre.trim()}`,
      )
      offline ||= !rp.online

      for (const p of parc) {
        const r = await enviarOEncolarEdicion(
          'parcela',
          p.id,
          {
            nombre: p.nombre.trim() || null,
            superficie_declarada_ha: p.superficie === '' ? null : Number(p.superficie),
          },
          `Parcela ${p.label}`,
        )
        offline ||= !r.online
      }
      setMsg(
        offline
          ? 'Guardado en el dispositivo — se subirá al recuperar señal.'
          : 'Datos actualizados.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setBusy(false)
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="mt-2 text-xs font-medium text-orange-700 underline-offset-2 hover:underline"
      >
        ✏️ Corregir datos del productor / parcela
      </button>
    )
  }

  return (
    <div className="mt-3 rounded-lg border border-orange-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Corregir datos (se guarda aunque no haya señal)
      </p>

      <div className="grid gap-2 sm:grid-cols-3">
        <Campo label="Nombre del productor" value={nombre} onChange={setNombre} />
        <Campo label="Comunidad" value={comunidad} onChange={setComunidad} />
        <Campo label="Municipio" value={municipio} onChange={setMunicipio} />
      </div>

      {parc.map((p, i) => (
        <div key={p.id} className="mt-2 grid gap-2 border-t border-slate-100 pt-2 sm:grid-cols-[1fr_8rem]">
          <Campo
            label={`Parcela ${p.label} — nombre`}
            value={p.nombre}
            onChange={(v) => setParc((a) => a.map((x, j) => (j === i ? { ...x, nombre: v } : x)))}
          />
          <Campo
            label="Superficie (ha)"
            value={p.superficie}
            type="number"
            onChange={(v) => setParc((a) => a.map((x, j) => (j === i ? { ...x, superficie: v } : x)))}
          />
        </div>
      ))}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={guardar}
          disabled={busy}
          className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button
          onClick={() => setAbierto(false)}
          className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

function Campo({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-orange-400"
      />
    </label>
  )
}
