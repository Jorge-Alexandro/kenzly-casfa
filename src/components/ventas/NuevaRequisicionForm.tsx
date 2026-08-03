'use client'

// Captura de una requisición: cliente (opcional) + lista de productos con
// cantidad. El kg equivalente se muestra en vivo (kg_por_unidad, Fase 3) para
// que quien captura ya vea lo que va a leer torrefacción en el PDF.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatoNum } from '@/lib/ventas/tipos'

const INPUT = 'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800'
const SELECT = `${INPUT} bg-white`
const hoy = () => new Date().toISOString().slice(0, 10)

interface Producto {
  id: string
  nombre: string
  linea: string
  unidad: string
  kg_por_unidad: number
}

export interface ItemInicial {
  producto_id: string
  cantidad: number
}

interface Fila {
  producto_id: string
  cantidad: string
}

export default function NuevaRequisicionForm({
  productos,
  clientes,
  pedidoId,
  clienteInicial,
  itemsIniciales,
}: {
  productos: Producto[]
  clientes: { id: string; nombre: string }[]
  pedidoId: string | null
  clienteInicial: string | null
  itemsIniciales: ItemInicial[]
}) {
  const router = useRouter()
  const [fecha, setFecha] = useState(hoy())
  const [clienteId, setClienteId] = useState(clienteInicial ?? '')
  const [clienteTexto, setClienteTexto] = useState('')
  const [filas, setFilas] = useState<Fila[]>(
    itemsIniciales.length > 0
      ? itemsIniciales.map((it) => ({ producto_id: it.producto_id, cantidad: String(it.cantidad) }))
      : [{ producto_id: '', cantidad: '' }],
  )
  const [solicito, setSolicito] = useState('')
  const [autorizo, setAutorizo] = useState('')
  const [entrego, setEntrego] = useState('Almacén')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos])

  function actualizar(i: number, patch: Partial<Fila>) {
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  }
  function agregarFila() {
    setFilas((prev) => [...prev, { producto_id: '', cantidad: '' }])
  }
  function quitarFila(i: number) {
    setFilas((prev) => prev.filter((_, j) => j !== i))
  }

  const totalKg = filas.reduce((s, f) => {
    const p = porId.get(f.producto_id)
    const c = Number(f.cantidad)
    return p && Number.isFinite(c) ? s + c * p.kg_por_unidad : s
  }, 0)

  async function guardar() {
    setError(null)
    const items = filas
      .filter((f) => f.producto_id && Number(f.cantidad) > 0)
      .map((f) => ({ producto_id: f.producto_id, cantidad: Number(f.cantidad) }))
    if (items.length === 0) return setError('Agrega al menos un producto con cantidad.')

    setGuardando(true)
    try {
      const res = await fetch('/api/ventas/requisiciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha,
          cliente_id: clienteId || null,
          cliente_texto: clienteId ? null : clienteTexto,
          pedido_id: pedidoId,
          solicito,
          autorizo,
          entrego,
          notas,
          items,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar la requisición')
      router.push('/ventas/requisiciones')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Fecha</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INPUT} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Cliente (opcional)</span>
          {clientes.length > 0 && !clienteTexto ? (
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={SELECT}>
              <option value="">— Sin especificar —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          ) : (
            <input
              value={clienteTexto}
              onChange={(e) => { setClienteTexto(e.target.value); setClienteId('') }}
              placeholder="Nombre libre (uso interno)"
              className={INPUT}
            />
          )}
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Productos</span>
          <button type="button" onClick={agregarFila} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
            + Producto
          </button>
        </div>
        <div className="space-y-2">
          {filas.map((f, i) => {
            const p = porId.get(f.producto_id)
            const kg = p && Number(f.cantidad) > 0 ? Number(f.cantidad) * p.kg_por_unidad : null
            return (
              <div key={i} className="grid grid-cols-[1fr_6rem_6rem_1.5rem] items-center gap-2">
                <select value={f.producto_id} onChange={(e) => actualizar(i, { producto_id: e.target.value })} className={SELECT}>
                  <option value="">— Producto —</option>
                  {productos.map((prod) => (
                    <option key={prod.id} value={prod.id}>[{prod.linea}] {prod.nombre}</option>
                  ))}
                </select>
                <input
                  type="number" min="0" step="any" placeholder="Cant."
                  value={f.cantidad}
                  onChange={(e) => actualizar(i, { cantidad: e.target.value })}
                  className={`${INPUT} tabular-nums`}
                />
                <span className="text-right text-xs tabular-nums text-slate-500">
                  {kg !== null ? `${formatoNum(kg, 2)} kg` : ''}
                </span>
                <button type="button" onClick={() => quitarFila(i)} className="text-slate-400 hover:text-rose-600" aria-label="Quitar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-right text-sm text-slate-600">
          Total: <span className="font-semibold tabular-nums text-slate-800">{formatoNum(totalKg, 2)} kg</span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Solicitó mercancía</span>
          <input value={solicito} onChange={(e) => setSolicito(e.target.value)} className={INPUT} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Autorizó</span>
          <input value={autorizo} onChange={(e) => setAutorizo(e.target.value)} className={INPUT} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-1 block">Entregó mercancía</span>
          <input value={entrego} onChange={(e) => setEntrego(e.target.value)} className={INPUT} />
        </label>
      </div>

      <label className="block text-xs text-slate-500">
        <span className="mb-1 block">Notas (opcional)</span>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={INPUT} />
      </label>

      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="flex justify-end">
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-md bg-orange-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Crear requisición'}
        </button>
      </div>
    </div>
  )
}
