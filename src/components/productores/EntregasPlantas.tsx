'use client'

// Entregas de plantas del programa de Agroecología para un productor.
// El coordinador captura aquí lo entregado; sale en la ficha para que el
// inspector verifique en campo que sí se están trabajando.
import { useEffect, useState } from 'react'

interface Entrega {
  id: string
  anio: number
  especie: string
  cantidad: number
  fecha_entrega: string | null
  observaciones: string | null
}

export default function EntregasPlantas({
  productorId,
  puedeEditar,
}: {
  productorId: string
  puedeEditar: boolean
}) {
  const [entregas, setEntregas] = useState<Entrega[]>([])
  const [cargando, setCargando] = useState(true)
  const [anio, setAnio] = useState(String(new Date().getFullYear()))
  const [especie, setEspecie] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    try {
      const res = await fetch(`/api/agroecologia/entregas?productor_id=${productorId}`)
      const body = await res.json()
      setEntregas(body.entregas ?? [])
    } catch {
      /* sin conexión: se deja vacío */
    } finally {
      setCargando(false)
    }
  }
  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productorId])

  async function agregar() {
    if (!especie.trim() || !cantidad) {
      setError('Especie y cantidad son obligatorias')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/agroecologia/entregas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productor_id: productorId,
          anio: Number(anio),
          especie: especie.trim(),
          cantidad: Number(cantidad),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      setEntregas((e) => [body.entrega, ...e])
      setEspecie('')
      setCantidad('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setBusy(false)
    }
  }

  async function quitar(id: string) {
    setEntregas((e) => e.filter((x) => x.id !== id))
    await fetch(`/api/agroecologia/entregas?id=${id}`, { method: 'DELETE' }).catch(() => {})
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Plantas entregadas (Agroecología)
      </h2>

      {cargando ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : entregas.length === 0 ? (
        <p className="text-sm text-slate-400">Sin entregas registradas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Año</th>
                <th className="py-1.5 pr-3 font-medium">Especie</th>
                <th className="py-1.5 pr-3 text-right font-medium">Cantidad</th>
                {puedeEditar && <th></th>}
              </tr>
            </thead>
            <tbody>
              {entregas.map((e) => (
                <tr key={e.id} className="border-t border-slate-50">
                  <td className="py-1.5 pr-3 tabular-nums text-slate-600">{e.anio}</td>
                  <td className="py-1.5 pr-3 text-slate-800">{e.especie}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-800">
                    {e.cantidad.toLocaleString('es-MX')}
                  </td>
                  {puedeEditar && (
                    <td className="py-1.5 text-right">
                      <button
                        onClick={() => quitar(e.id)}
                        className="text-slate-400 hover:text-red-600"
                        title="Quitar"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {puedeEditar && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <label className="w-20">
            <span className="mb-1 block text-xs text-slate-500">Año</span>
            <input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-orange-400" />
          </label>
          <label className="min-w-[8rem] flex-1">
            <span className="mb-1 block text-xs text-slate-500">Especie</span>
            <input value={especie} onChange={(e) => setEspecie(e.target.value)} placeholder="Café Robusta, Inga…" className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-orange-400" />
          </label>
          <label className="w-28">
            <span className="mb-1 block text-xs text-slate-500">Cantidad</span>
            <input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-orange-400" />
          </label>
          <button
            onClick={agregar}
            disabled={busy}
            className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {busy ? '…' : 'Agregar'}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  )
}
