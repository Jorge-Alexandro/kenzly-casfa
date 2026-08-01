'use client'

// Grid editable del catálogo: línea, unidad y kg_por_unidad por producto, con
// auditoría automática contra el gramaje que trae el propio nombre, y el
// export del catálogo de conceptos (para que doña Juani copie y pegue).
import { useMemo, useState } from 'react'
import { gramajeDelNombre, formatoNum, type ProductoVenta } from '@/lib/ventas/tipos'
import { LINEAS } from '@/lib/ventas/cfdi.mjs'

const INPUT = 'w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800'
const SELECT = `${INPUT} bg-white`

interface Producto extends ProductoVenta {
  kg_por_unidad: number
}

interface Fila {
  linea: string
  unidad: string
  kg_por_unidad: string
}

export default function TabuladorCliente({ productos }: { productos: Producto[] }) {
  const [ediciones, setEdiciones] = useState<Record<string, Fila>>({})
  const [guardando, setGuardando] = useState<string | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardados, setGuardados] = useState<Record<string, boolean>>({})
  const [busqueda, setBusqueda] = useState('')
  const [soloRevisar, setSoloRevisar] = useState(false)

  const auditoria = useMemo(() => {
    const map = new Map<string, { implicito: number | null; coincide: boolean }>()
    for (const p of productos) {
      const implicito = gramajeDelNombre(p.nombre)
      const coincide = implicito === null || Math.abs(implicito - Number(p.kg_por_unidad)) < 0.001
      map.set(p.id, { implicito, coincide })
    }
    return map
  }, [productos])

  const nRevisar = Array.from(auditoria.values()).filter((a) => !a.coincide).length

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return productos
      .filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.linea.toLowerCase().includes(q))
      .filter((p) => !soloRevisar || !auditoria.get(p.id)?.coincide)
      .sort((a, b) => a.linea.localeCompare(b.linea) || a.nombre.localeCompare(b.nombre))
  }, [productos, busqueda, soloRevisar, auditoria])

  function valor(p: Producto, campo: keyof Fila): string {
    return ediciones[p.id]?.[campo] ?? String(p[campo === 'kg_por_unidad' ? 'kg_por_unidad' : campo])
  }

  function editar(p: Producto, campo: keyof Fila, val: string) {
    setGuardados((g) => ({ ...g, [p.id]: false }))
    setEdiciones((prev) => ({
      ...prev,
      [p.id]: {
        linea: prev[p.id]?.linea ?? p.linea,
        unidad: prev[p.id]?.unidad ?? p.unidad,
        kg_por_unidad: prev[p.id]?.kg_por_unidad ?? String(p.kg_por_unidad),
        [campo]: val,
      },
    }))
  }

  const esDirty = (id: string) => id in ediciones

  async function guardar(p: Producto) {
    const fila = ediciones[p.id]
    if (!fila) return
    setGuardando(p.id)
    setErrores((e) => ({ ...e, [p.id]: '' }))
    try {
      const res = await fetch(`/api/ventas/productos/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linea: fila.linea,
          unidad: fila.unidad,
          kg_por_unidad: Number(fila.kg_por_unidad),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      p.linea = fila.linea
      p.unidad = fila.unidad
      p.kg_por_unidad = Number(fila.kg_por_unidad)
      setEdiciones((prev) => {
        const { [p.id]: _quitar, ...resto } = prev
        return resto
      })
      setGuardados((g) => ({ ...g, [p.id]: true }))
    } catch (e) {
      setErrores((err) => ({ ...err, [p.id]: e instanceof Error ? e.message : 'Error al guardar' }))
    } finally {
      setGuardando(null)
    }
  }

  function descargarCatalogo() {
    const lineas = [...productos]
      .sort((a, b) => a.linea.localeCompare(b.linea) || a.nombre.localeCompare(b.nombre))
      .map((p) => p.nombre.toUpperCase())
    const contenido = lineas.join('\r\n')
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'catalogo-conceptos-facturacion.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto o línea…"
          className={`${INPUT} max-w-xs`}
        />
        <button
          type="button"
          onClick={() => setSoloRevisar((v) => !v)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            soloRevisar ? 'bg-amber-600 text-white' : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {nRevisar > 0 ? `⚠ ${nRevisar} para revisar` : 'Sin inconsistencias'}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={descargarCatalogo}
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700"
        >
          ↓ Catálogo de conceptos (.txt)
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left font-mono text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2.5">Producto (concepto exacto a facturar)</th>
              <th className="px-3 py-2.5">Línea</th>
              <th className="px-3 py-2.5">Unidad</th>
              <th className="px-3 py-2.5">Kg por unidad</th>
              <th className="px-3 py-2.5">Auditoría</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((p) => {
              const a = auditoria.get(p.id) ?? { implicito: null, coincide: true }
              return (
                <tr key={p.id} className={!a?.coincide ? 'bg-amber-50/40' : undefined}>
                  <td className="max-w-[18rem] px-3 py-2">
                    <p className="truncate font-mono text-xs text-slate-700" title={p.nombre}>{p.nombre}</p>
                  </td>
                  <td className="px-3 py-2">
                    <select value={valor(p, 'linea')} onChange={(e) => editar(p, 'linea', e.target.value)} className={SELECT}>
                      {LINEAS.map((l: string) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select value={valor(p, 'unidad')} onChange={(e) => editar(p, 'unidad', e.target.value)} className={SELECT}>
                      <option value="PZA">PZA</option>
                      <option value="KG">KG</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={valor(p, 'kg_por_unidad')}
                      onChange={(e) => editar(p, 'kg_por_unidad', e.target.value)}
                      className={`${INPUT} w-24 font-mono tabular-nums`}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {a?.implicito === null ? (
                      <span className="text-slate-400">— sin gramaje en el nombre</span>
                    ) : a.coincide ? (
                      <span className="text-emerald-600">✓ coincide</span>
                    ) : (
                      <span className="font-medium text-amber-700">
                        ⚠ el nombre implica {formatoNum(a.implicito, 4)} kg
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {esDirty(p.id) && (
                      <button
                        type="button"
                        onClick={() => guardar(p)}
                        disabled={guardando === p.id}
                        className="rounded-md bg-orange-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                      >
                        {guardando === p.id ? '…' : 'Guardar'}
                      </button>
                    )}
                    {guardados[p.id] && !esDirty(p.id) && <span className="text-xs text-emerald-600">✓ guardado</span>}
                    {errores[p.id] && <p className="mt-1 text-xs text-rose-600">{errores[p.id]}</p>}
                  </td>
                </tr>
              )
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">
                  Ningún producto coincide con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
