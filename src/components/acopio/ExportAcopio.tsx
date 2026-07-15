'use client'

// §16 — Exportar el acopio a Excel con filtros. Arma el querystring y deja que
// el navegador descargue /api/acopio/export (el servidor construye el archivo).
import { useMemo, useState } from 'react'
import { ESTADO_ENTRADA_LABEL, type EstadoEntrada, type ProductoCatalogo } from '@/lib/acopio/tipos'

const ESTADOS = Object.keys(ESTADO_ENTRADA_LABEL) as EstadoEntrada[]

export default function ExportAcopio({ catalogo }: { catalogo: ProductoCatalogo[] }) {
  const [abierto, setAbierto] = useState(false)
  const [f, setF] = useState({ desde: '', hasta: '', especie: '', tipo: '', estado: '', proveedor: '' })

  const especies = useMemo(
    () => Array.from(new Set(catalogo.map((c) => c.especie))),
    [catalogo],
  )
  const tipos = useMemo(
    () =>
      Array.from(
        new Set(
          catalogo.filter((c) => !f.especie || c.especie === f.especie).map((c) => c.tipo),
        ),
      ),
    [catalogo, f.especie],
  )

  const href = useMemo(() => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v)
    const qs = p.toString()
    return `/api/acopio/export${qs ? `?${qs}` : ''}`
  }, [f])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value, ...(k === 'especie' ? { tipo: '' } : null) }))

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      >
        ↓ Exportar a Excel
      </button>
    )
  }

  return (
    <section className="w-full rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Exportar a Excel</h2>
        <button onClick={() => setAbierto(false)} className="text-sm text-slate-400 hover:text-slate-600">
          Cerrar
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Campo label="Desde">
          <input type="date" value={f.desde} onChange={set('desde')} className={INPUT} />
        </Campo>
        <Campo label="Hasta">
          <input type="date" value={f.hasta} onChange={set('hasta')} className={INPUT} />
        </Campo>
        <Campo label="Especie">
          <select value={f.especie} onChange={set('especie')} className={INPUT}>
            <option value="">Todas</option>
            {especies.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </Campo>
        <Campo label="Tipo">
          <select value={f.tipo} onChange={set('tipo')} className={INPUT}>
            <option value="">Todos</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Campo>
        <Campo label="Estado">
          <select value={f.estado} onChange={set('estado')} className={INPUT}>
            <option value="">Todos</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_ENTRADA_LABEL[e]}</option>)}
          </select>
        </Campo>
        <Campo label="Proveedor">
          <input
            type="text"
            value={f.proveedor}
            onChange={set('proveedor')}
            placeholder="Nombre o parte"
            className={INPUT}
          />
        </Campo>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-slate-400">3 hojas: Entradas, Pesadas y Resumen.</p>
        <a
          href={href}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          ↓ Descargar .xlsx
        </a>
      </div>
    </section>
  )
}

const INPUT = 'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}
