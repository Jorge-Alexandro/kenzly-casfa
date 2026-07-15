'use client'

// Captura manual de venta: cliente (lookup por RFC/nombre) → producto →
// cantidad → precio. El precio se pre-carga del acuerdo vigente
// (ventas_precio_cliente) pero es editable; si se desvía más de la tolerancia
// se AVISA sin bloquear (el servidor marca alerta_precio). El inventario lo
// descuenta el trigger de la BD al guardar.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ClienteVenta, PrecioCliente } from '@/lib/ventas/tipos'
import { formatoMXN, formatoNum } from '@/lib/ventas/tipos'

interface ProductoOpcion {
  id: string
  nombre: string
  linea: string
  unidad: string
}

export default function CapturaVenta({
  clientes,
  productos,
  stock,
}: {
  clientes: ClienteVenta[]
  productos: ProductoOpcion[]
  stock: Record<string, number>
}) {
  const router = useRouter()
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [precio, setPrecio] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [precios, setPrecios] = useState<Record<string, PrecioCliente>>({})
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'alerta' | 'error'; texto: string } | null>(null)

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toUpperCase()
    if (!q) return clientes
    return clientes.filter((c) => c.rfc.toUpperCase().includes(q) || c.nombre.toUpperCase().includes(q))
  }, [clientes, busquedaCliente])

  const cliente = clientes.find((c) => c.id === clienteId) ?? null
  const producto = productos.find((p) => p.id === productoId) ?? null
  const acuerdo = productoId ? precios[productoId] : undefined
  const disponible = productoId ? stock[productoId] : undefined

  // Precios acordados vigentes del cliente elegido.
  useEffect(() => {
    if (!clienteId) {
      setPrecios({})
      return
    }
    let cancelado = false
    fetch(`/api/ventas/precios?cliente_id=${clienteId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelado || !json.precios) return
        const map: Record<string, PrecioCliente> = {}
        for (const p of json.precios as PrecioCliente[]) map[p.producto_id] = p
        setPrecios(map)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
  }, [clienteId])

  // Pre-carga el precio acordado al elegir producto (editable después).
  useEffect(() => {
    if (productoId && precios[productoId]) setPrecio(String(precios[productoId].precio_acordado))
  }, [productoId, precios])

  const cantidadNum = Number(cantidad)
  const precioNum = Number(precio)
  const importe = Number.isFinite(cantidadNum) && Number.isFinite(precioNum) ? cantidadNum * precioNum : 0

  const desvio =
    acuerdo && Number(acuerdo.precio_acordado) > 0 && Number.isFinite(precioNum) && precio !== ''
      ? (precioNum - Number(acuerdo.precio_acordado)) / Number(acuerdo.precio_acordado)
      : null
  const fueraDeTolerancia = desvio !== null && acuerdo && Math.abs(desvio) > Number(acuerdo.tolerancia_pct)

  async function guardar() {
    setMensaje(null)
    setGuardando(true)
    try {
      const res = await fetch('/api/ventas/ventas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: clienteId,
          producto_id: productoId,
          cantidad: cantidadNum,
          precio_unitario: precioNum,
          fecha,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMensaje({ tipo: 'error', texto: json.error ?? `Error ${res.status}` })
      } else {
        setMensaje({
          tipo: json.alerta_precio ? 'alerta' : 'ok',
          texto: json.alerta_precio
            ? `Venta guardada por ${formatoMXN(json.importe)} — quedó MARCADA por desviarse del precio acordado (${formatoMXN(Number(json.precio_acordado))}).`
            : `Venta guardada por ${formatoMXN(json.importe)}. Inventario descontado.`,
        })
        setCantidad('')
        router.refresh()
      }
    } catch (e) {
      setMensaje({ tipo: 'error', texto: (e as Error).message })
    }
    setGuardando(false)
  }

  const puedeGuardar =
    clienteId && productoId && Number.isFinite(cantidadNum) && cantidadNum > 0 && Number.isFinite(precioNum) && precioNum >= 0 && !guardando

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
          Cliente (busca por RFC o nombre)
        </label>
        <input
          value={busquedaCliente}
          onChange={(e) => setBusquedaCliente(e.target.value)}
          placeholder="AET1809215E3 o AGROINDUSTRIAS…"
          className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
        />
        <div className="mt-2 max-h-44 overflow-auto rounded-md border border-slate-100">
          {clientesFiltrados.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-400">
              Sin coincidencias. Los clientes se dan de alta al importar su primer CFDI.
            </p>
          ) : (
            clientesFiltrados.map((c) => (
              <button
                key={c.id}
                onClick={() => setClienteId(c.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                  clienteId === c.id ? 'bg-orange-50 text-orange-800' : 'hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0 truncate">{c.nombre}</span>
                <span className="ml-3 shrink-0 font-mono text-xs text-slate-500">{c.rfc}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Producto</label>
            <select
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            >
              <option value="">— Elegir producto —</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.linea}] {p.nombre}
                </option>
              ))}
            </select>
            {producto && (
              <p className="mt-1.5 text-xs text-slate-500">
                Inventario disponible:{' '}
                <span className={`font-semibold ${disponible !== undefined && disponible <= 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                  {disponible === undefined ? 'sin registro' : `${formatoNum(disponible, 3)} ${producto.unidad}`}
                </span>
                {acuerdo && (
                  <>
                    {' '}· Precio acordado: <span className="font-semibold text-slate-700">{formatoMXN(Number(acuerdo.precio_acordado))}</span>{' '}
                    (±{(Number(acuerdo.tolerancia_pct) * 100).toFixed(0)}%)
                  </>
                )}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Cantidad {producto ? `(${producto.unidad})` : ''}
            </label>
            <input
              type="number"
              min="0"
              step="any"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Precio unitario (MXN)</label>
            <input
              type="number"
              min="0"
              step="any"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              className={`mt-1.5 w-full rounded-md border px-3 py-2 text-sm tabular-nums focus:outline-none ${
                fueraDeTolerancia ? 'border-amber-400 bg-amber-50 focus:border-amber-500' : 'border-slate-300 focus:border-orange-500'
              }`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div className="flex items-end justify-end">
            <p className="text-sm text-slate-500">
              Importe: <span className="text-base font-semibold tabular-nums text-slate-800">{formatoMXN(importe)}</span>
            </p>
          </div>
        </div>

        {fueraDeTolerancia && desvio !== null && (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            El precio se desvía {(desvio * 100).toFixed(1)}% del acordado — la venta se guardará
            marcada con alerta de precio (no se bloquea).
          </p>
        )}
        {mensaje && (
          <p
            className={`mt-3 rounded-md border px-3 py-2 text-sm ${
              mensaje.tipo === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : mensaje.tipo === 'alerta'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}
          >
            {mensaje.texto}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={guardar}
            disabled={!puedeGuardar}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar venta'}
          </button>
        </div>
      </div>
    </div>
  )
}
