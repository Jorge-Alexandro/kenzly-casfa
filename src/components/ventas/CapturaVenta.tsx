'use client'

// Captura de una venta desde cero: cliente → una o varias líneas de producto
// (carrito) → guardar. El precio de cada línea se pre-carga del acuerdo
// vigente (ventas_precio_cliente) pero es editable; si se desvía más de la
// tolerancia se AVISA sin bloquear. El inventario lo descuenta el trigger de
// la BD al guardar (mismo trigger de siempre — la venta nace origen='manual').
// Pagos y facturas se agregan DESPUÉS, en el detalle del pedido.
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

interface LineaCarrito {
  key: string
  producto_id: string
  producto_nombre: string
  unidad: string
  cantidad: string
  precio: string
  fueraDeTolerancia: boolean
}

const INPUT = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none'

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
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [notas, setNotas] = useState('')
  const [precios, setPrecios] = useState<Record<string, PrecioCliente>>({})

  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [precio, setPrecio] = useState('')
  const [carrito, setCarrito] = useState<LineaCarrito[]>([])

  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'alerta' | 'error'; texto: string } | null>(null)

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toUpperCase()
    if (!q) return clientes
    return clientes.filter((c) => c.rfc.toUpperCase().includes(q) || c.nombre.toUpperCase().includes(q))
  }, [clientes, busquedaCliente])

  const cliente = clientes.find((c) => c.id === clienteId) ?? null
  const producto = productos.find((p) => p.id === productoId) ?? null
  const acuerdo = productoId ? precios[productoId] : undefined
  const disponible = productoId ? stock[productoId] : undefined

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

  useEffect(() => {
    if (productoId && precios[productoId]) setPrecio(String(precios[productoId].precio_acordado))
  }, [productoId, precios])

  const cantidadNum = Number(cantidad)
  const precioNum = Number(precio)
  const importeLinea = Number.isFinite(cantidadNum) && Number.isFinite(precioNum) ? cantidadNum * precioNum : 0

  const desvio =
    acuerdo && Number(acuerdo.precio_acordado) > 0 && Number.isFinite(precioNum) && precio !== ''
      ? (precioNum - Number(acuerdo.precio_acordado)) / Number(acuerdo.precio_acordado)
      : null
  const fueraDeTolerancia = desvio !== null && acuerdo != null && Math.abs(desvio) > Number(acuerdo.tolerancia_pct)

  const totalCarrito = carrito.reduce((s, l) => s + Number(l.cantidad) * Number(l.precio), 0)

  function agregarLinea() {
    if (!producto || !Number.isFinite(cantidadNum) || cantidadNum <= 0 || !Number.isFinite(precioNum) || precioNum < 0) return
    setCarrito((c) => [
      ...c,
      {
        key: `${productoId}-${Date.now()}`,
        producto_id: productoId,
        producto_nombre: producto.nombre,
        unidad: producto.unidad,
        cantidad,
        precio,
        fueraDeTolerancia,
      },
    ])
    setProductoId('')
    setCantidad('')
    setPrecio('')
  }

  function quitarLinea(key: string) {
    setCarrito((c) => c.filter((l) => l.key !== key))
  }

  async function guardar() {
    setMensaje(null)
    setGuardando(true)
    try {
      const res = await fetch('/api/ventas/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: clienteId,
          fecha,
          notas,
          lineas: carrito.map((l) => ({
            producto_id: l.producto_id,
            cantidad: Number(l.cantidad),
            precio_unitario: Number(l.precio),
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMensaje({ tipo: 'error', texto: json.error ?? `Error ${res.status}` })
        setGuardando(false)
        return
      }
      router.push(`/ventas/pedidos/${json.id}`)
      router.refresh()
    } catch (e) {
      setMensaje({ tipo: 'error', texto: (e as Error).message })
      setGuardando(false)
    }
  }

  const puedeAgregarLinea = productoId && Number.isFinite(cantidadNum) && cantidadNum > 0 && Number.isFinite(precioNum) && precioNum >= 0
  const puedeGuardar = clienteId && carrito.length > 0 && !guardando

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
          className={`mt-1.5 ${INPUT}`}
        />
        <div className="mt-2 max-h-40 overflow-auto rounded-md border border-slate-100">
          {clientesFiltrados.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-400">Sin coincidencias.</p>
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
        {cliente && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-500">
              <span className="mb-1 block uppercase tracking-wide">Fecha</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INPUT} />
            </label>
            <label className="text-xs text-slate-500">
              <span className="mb-1 block uppercase tracking-wide">Notas (opcional)</span>
              <input value={notas} onChange={(e) => setNotas(e.target.value)} className={INPUT} />
            </label>
          </div>
        )}
      </div>

      {cliente && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Agregar producto</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <select value={productoId} onChange={(e) => setProductoId(e.target.value)} className={`${INPUT} bg-white`}>
                <option value="">— Elegir producto —</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>[{p.linea}] {p.nombre}</option>
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
            <label className="text-xs text-slate-500">
              <span className="mb-1 block uppercase tracking-wide">Cantidad {producto ? `(${producto.unidad})` : ''}</span>
              <input type="number" min="0" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={`${INPUT} tabular-nums`} />
            </label>
            <label className="text-xs text-slate-500">
              <span className="mb-1 block uppercase tracking-wide">Precio unitario (MXN)</span>
              <input
                type="number" min="0" step="any" value={precio} onChange={(e) => setPrecio(e.target.value)}
                className={`${INPUT} tabular-nums ${fueraDeTolerancia ? 'border-amber-400 bg-amber-50' : ''}`}
              />
            </label>
          </div>
          {fueraDeTolerancia && desvio !== null && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              El precio se desvía {(desvio * 100).toFixed(1)}% del acordado — la línea se agregará marcada.
            </p>
          )}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Importe de la línea: <span className="font-semibold tabular-nums text-slate-800">{formatoMXN(importeLinea)}</span>
            </p>
            <button
              type="button"
              onClick={agregarLinea}
              disabled={!puedeAgregarLinea}
              className="rounded-md border border-orange-600 px-3 py-1.5 text-sm font-medium text-orange-700 transition hover:bg-orange-50 disabled:opacity-40"
            >
              + Agregar al pedido
            </button>
          </div>
        </div>
      )}

      {carrito.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2 text-right">Importe</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carrito.map((l) => (
                <tr key={l.key} className={l.fueraDeTolerancia ? 'bg-amber-50/50' : undefined}>
                  <td className="px-3 py-2 text-slate-700">{l.producto_nombre}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{l.cantidad} {l.unidad}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatoMXN(Number(l.precio))}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
                    {formatoMXN(Number(l.cantidad) * Number(l.precio))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => quitarLinea(l.key)} className="text-xs text-rose-500 hover:text-rose-700">Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/60">
                <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Total</td>
                <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-slate-800">{formatoMXN(totalCarrito)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {mensaje && (
        <p className={`rounded-md border px-3 py-2 text-sm ${
          mensaje.tipo === 'alerta' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-rose-200 bg-rose-50 text-rose-800'
        }`}>
          {mensaje.texto}
        </p>
      )}

      <div className="flex justify-end">
        <button
          onClick={guardar}
          disabled={!puedeGuardar}
          className="rounded-md bg-orange-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar venta'}
        </button>
      </div>
    </div>
  )
}
