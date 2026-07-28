'use client'

// Clasifica cada proveedor del acopio como SOCIEDAD (persona moral, se agrupa
// como cooperativa) o INDIVIDUAL (persona física, suma en "socios individuales").
// Con esto Francisco maneja las cooperativas nuevas sin depender de SQL: el
// reporte por cooperativa se reagrupa según lo que marque aquí.
import { useMemo, useState } from 'react'
import type { ProveedorTipo } from '@/lib/data/concentrado'

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export default function ProveedoresTipo({ proveedores }: { proveedores: ProveedorTipo[] }) {
  const [rows, setRows] = useState(proveedores)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'moral' | 'fisica'>('todos')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)

  const visibles = useMemo(() => {
    const q = norm(busqueda)
    return rows.filter((p) => {
      if (q && !norm(p.nombre).includes(q)) return false
      if (filtro !== 'todos' && p.tipo_persona !== filtro) return false
      return true
    })
  }, [rows, busqueda, filtro])

  const nMoral = rows.filter((p) => p.tipo_persona === 'moral').length

  async function marcar(p: ProveedorTipo, tipo: 'moral' | 'fisica') {
    if (p.tipo_persona === tipo) return
    setError(null)
    setGuardando(p.id)
    // Optimista: se refleja al instante y se revierte si falla.
    setRows((rs) => rs.map((x) => (x.id === p.id ? { ...x, tipo_persona: tipo } : x)))
    try {
      const res = await fetch(`/api/acopio/proveedores?id=${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo_persona: tipo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cambiar el tipo')
    } catch (e) {
      setRows((rs) => rs.map((x) => (x.id === p.id ? { ...x, tipo_persona: p.tipo_persona } : x)))
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(null)
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Proveedores — sociedad o individual
        </h2>
        <p className="text-xs text-slate-400">
          Marca cada proveedor. Las <strong>sociedades</strong> (cooperativas) se listan una por una
          en el acopio por cooperativa; los <strong>individuales</strong> suman en “socios
          individuales”. {nMoral} de {rows.length} marcados como sociedad.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar proveedor…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {(['todos', 'moral', 'fisica'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              filtro === f ? 'bg-orange-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f === 'todos' ? 'Todos' : f === 'moral' ? 'Sociedades' : 'Individuales'}
          </button>
        ))}
      </div>

      {error && <p className="mx-4 mb-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="max-h-[26rem] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Proveedor</th>
              <th className="px-3 py-2 text-right">Boletas</th>
              <th className="px-3 py-2 text-center">Tipo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((p) => (
              <tr key={p.id} className={guardando === p.id ? 'opacity-60' : undefined}>
                <td className="px-4 py-2 text-slate-800">{p.nombre}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{p.boletas || '—'}</td>
                <td className="px-3 py-2">
                  <div className="mx-auto flex w-fit overflow-hidden rounded-md border border-slate-300">
                    <button
                      onClick={() => marcar(p, 'moral')}
                      className={`px-2.5 py-1 text-xs font-medium ${
                        p.tipo_persona === 'moral' ? 'bg-sky-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      Sociedad
                    </button>
                    <button
                      onClick={() => marcar(p, 'fisica')}
                      className={`border-l border-slate-300 px-2.5 py-1 text-xs font-medium ${
                        p.tipo_persona === 'fisica' ? 'bg-slate-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      Individual
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">Ningún proveedor con ese filtro.</p>
        )}
      </div>
      <p className="px-4 py-2 text-xs text-slate-400">
        El cambio se guarda al instante. Recarga el concentrado para ver el acopio por cooperativa reagrupado.
      </p>
    </section>
  )
}
