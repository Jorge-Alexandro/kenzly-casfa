'use client'

// Captura y lista de movimientos de inventario que NO son venta: regalía,
// cortesía, merma, ajuste, entrada. La venta ya descuenta stock sola (Fase 4).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TIPO_MOVIMIENTO_LABEL, TIPO_MOVIMIENTO_BADGE, formatoNum,
  type MovimientoRow, type TipoMovimiento,
} from '@/lib/ventas/tipos'

const INPUT = 'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800'
const SELECT = `${INPUT} bg-white`
const hoy = () => new Date().toISOString().slice(0, 10)

const TIPOS: TipoMovimiento[] = ['regalia', 'cortesia', 'merma', 'ajuste_mas', 'ajuste_menos', 'entrada']
const LLEVA_CLIENTE = new Set<TipoMovimiento>(['regalia', 'cortesia'])

export default function MovimientosCliente({
  movimientos,
  productos,
  clientes,
}: {
  movimientos: MovimientoRow[]
  productos: { id: string; nombre: string; linea: string; unidad: string }[]
  clientes: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const [tipo, setTipo] = useState<TipoMovimiento>('regalia')
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [motivo, setMotivo] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const producto = productos.find((p) => p.id === productoId) ?? null

  async function guardar() {
    setError(null)
    if (!productoId) return setError('Elige el producto.')
    const cantidadNum = Number(cantidad)
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) return setError('Cantidad inválida.')
    if (tipo === 'merma' && !motivo.trim()) return setError('La merma necesita un motivo.')

    setGuardando(true)
    try {
      const res = await fetch('/api/ventas/movimientos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          producto_id: productoId,
          tipo,
          cantidad: cantidadNum,
          cliente_id: LLEVA_CLIENTE.has(tipo) && clienteId ? clienteId : null,
          motivo,
          fecha,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar el movimiento')
      setCantidad('')
      setMotivo('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(m: MovimientoRow) {
    if (!confirm(`¿Borrar este movimiento (${TIPO_MOVIMIENTO_LABEL[m.tipo]} · ${formatoNum(m.cantidad, 3)} ${m.producto_unidad})? Revierte el inventario.`)) return
    const res = await fetch(`/api/ventas/movimientos?id=${m.id}`, { method: 'DELETE' })
    if (!res.ok) return setError('No se pudo borrar el movimiento')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Registrar movimiento</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimiento)} className={SELECT}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>{TIPO_MOVIMIENTO_LABEL[t]}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INPUT} />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">
            <span className="mb-1 block">Producto</span>
            <select value={productoId} onChange={(e) => setProductoId(e.target.value)} className={SELECT}>
              <option value="">— Elegir producto —</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>[{p.linea}] {p.nombre}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">Cantidad {producto ? `(${producto.unidad})` : ''}</span>
            <input type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={`${INPUT} tabular-nums`} />
          </label>
          {LLEVA_CLIENTE.has(tipo) && (
            <label className="text-xs text-slate-500">
              <span className="mb-1 block">Cliente (opcional)</span>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={SELECT}>
                <option value="">— Sin especificar —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </label>
          )}
          <label className={`text-xs text-slate-500 ${LLEVA_CLIENTE.has(tipo) ? '' : 'sm:col-span-2'}`}>
            <span className="mb-1 block">Motivo {tipo === 'merma' ? '*' : '(opcional)'}</span>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={INPUT} placeholder={tipo === 'merma' ? 'Se dañó en bodega, humedad…' : ''} />
          </label>
        </div>

        {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="mt-3 flex justify-end">
          <button
            onClick={guardar}
            disabled={guardando}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          Historial ({movimientos.length})
        </h2>
        {movimientos.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400">Sin movimientos todavía.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2">Cliente / motivo</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">{m.fecha}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_MOVIMIENTO_BADGE[m.tipo]}`}>
                      {TIPO_MOVIMIENTO_LABEL[m.tipo]}
                    </span>
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-2 text-slate-700">{m.producto_nombre}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatoNum(m.cantidad, 3)} {m.producto_unidad}</td>
                  <td className="max-w-[12rem] truncate px-3 py-2 text-slate-500">
                    {m.cliente_nombre ?? m.motivo ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => borrar(m)} className="text-xs text-rose-500 hover:text-rose-700">Borrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
