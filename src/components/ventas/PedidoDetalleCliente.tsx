'use client'

// Detalle de un pedido: líneas vendidas (solo lectura) + Pagos y Facturas,
// espejo exacto del Detalle de boleta en Contabilidad (TablaCostos.tsx).
// Cancelar el pedido borra sus líneas — el trigger de stock repone solo — y
// nunca toca las facturas ya ligadas: son evidencia aparte a propósito.
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  formatoMXN, formatoNum, METODOS_PAGO_VENTA,
  type PedidoDetalle, type PagoPedido, type FacturaPedido,
} from '@/lib/ventas/tipos'

const MINI = 'w-full rounded-md border border-slate-300 px-2 py-1 text-sm'
const hoy = () => new Date().toISOString().slice(0, 10)

export default function PedidoDetalleCliente({ pedido, total }: { pedido: PedidoDetalle; total: number }) {
  const router = useRouter()
  const [pagos, setPagos] = useState(pedido.pagos)
  const [facturas, setFacturas] = useState(pedido.facturas)
  const [importePagado, setImportePagado] = useState(pedido.importe_pagado)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [motivoCancela, setMotivoCancela] = useState('')

  const [pago, setPago] = useState({ fecha: hoy(), monto: '', metodo: 'Transferencia', referencia: '' })
  const [fact, setFact] = useState({ folio: '', fecha: hoy(), monto: '', uuid_fiscal: '' })
  const [importado, setImportado] = useState<{ mensaje: string; ok: boolean } | null>(null)
  const [importando, setImportando] = useState(false)
  const archivoRef = useRef<HTMLInputElement>(null)

  const restante = Math.round((total - importePagado) * 100) / 100

  async function agregarPago() {
    setError(null)
    if (!(Number(pago.monto) > 0)) return setError('El monto del pago debe ser mayor a 0.')
    setOcupado(true)
    try {
      const res = await fetch(`/api/ventas/pedidos/${pedido.id}/pagos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pago),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo registrar el pago')
      setPagos((ps) => [...ps, { ...data.pago, monto: Number(data.pago.monto) }])
      setImportePagado(Number(data.importe_pagado))
      setPago({ fecha: hoy(), monto: '', metodo: pago.metodo, referencia: '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar el pago')
    } finally {
      setOcupado(false)
    }
  }

  async function borrarPago(p: PagoPedido) {
    if (!confirm(`¿Borrar el pago de ${formatoMXN(p.monto)} del ${p.fecha}?`)) return
    setError(null)
    const res = await fetch(`/api/ventas/pedidos/${pedido.id}/pagos?id=${p.id}`, { method: 'DELETE' })
    if (!res.ok) return setError('No se pudo borrar el pago')
    const quedan = pagos.filter((x) => x.id !== p.id)
    setPagos(quedan)
    setImportePagado(Math.round(quedan.reduce((s, x) => s + x.monto, 0) * 100) / 100)
  }

  async function importarArchivo(archivo: File) {
    setImportado(null)
    setError(null)
    setImportando(true)
    try {
      const buf = await archivo.arrayBuffer()
      let binario = ''
      const bytes = new Uint8Array(buf)
      const TROZO = 0x8000
      for (let i = 0; i < bytes.length; i += TROZO) {
        binario += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + TROZO)))
      }
      const contenido = btoa(binario)

      const res = await fetch('/api/ventas/pedidos/facturas/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreArchivo: archivo.name, contenido }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo leer el archivo')

      setFact((f) => ({
        folio: data.folio ?? f.folio,
        fecha: data.fecha ?? f.fecha,
        monto: data.monto != null ? String(data.monto) : f.monto,
        uuid_fiscal: data.uuid_fiscal ?? f.uuid_fiscal,
      }))

      const detalle = data.fuente === 'xml'
        ? (data.receptor_nombre ? ` — ${data.receptor_nombre}` : '')
        : ` — ${data.camposDetectados}/${data.camposTotal} campos, revisa antes de guardar`
      const avisoFolio = data.folio_generado
        ? ` · este CFDI no traía folio, se puso "${data.folio}" (del UUID) — cámbialo si quieres otro`
        : ''
      setImportado({
        ok: true,
        mensaje: (data.fuente === 'xml' ? `CFDI leído${detalle}` : `PDF leído (estimado)${detalle}`) + avisoFolio,
      })
    } catch (e) {
      setImportado({ ok: false, mensaje: e instanceof Error ? e.message : 'Error al leer el archivo' })
    } finally {
      setImportando(false)
      if (archivoRef.current) archivoRef.current.value = ''
    }
  }

  async function agregarFactura() {
    setError(null)
    if (!fact.folio.trim()) return setError('Escribe el folio de la factura.')
    setOcupado(true)
    try {
      const res = await fetch(`/api/ventas/pedidos/${pedido.id}/facturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fact),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo registrar la factura')
      setFacturas((fs) => [...fs, { ...data.factura, monto: data.factura.monto == null ? null : Number(data.factura.monto) }])
      setFact({ folio: '', fecha: hoy(), monto: '', uuid_fiscal: '' })
      setImportado(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar la factura')
    } finally {
      setOcupado(false)
    }
  }

  async function borrarFactura(f: FacturaPedido) {
    if (!confirm(`¿Borrar la factura ${f.folio}?`)) return
    setError(null)
    const res = await fetch(`/api/ventas/pedidos/${pedido.id}/facturas?id=${f.id}`, { method: 'DELETE' })
    if (!res.ok) return setError('No se pudo borrar la factura')
    setFacturas((fs) => fs.filter((x) => x.id !== f.id))
  }

  async function cancelarPedido() {
    setError(null)
    if (!motivoCancela.trim()) return setError('Escribe el motivo de la cancelación.')
    if (!confirm('¿Cancelar este pedido? Repone el inventario de sus líneas.')) return
    setOcupado(true)
    try {
      const res = await fetch(`/api/ventas/pedidos/${pedido.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'cancelar', motivo: motivoCancela }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cancelar')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cancelar')
    } finally {
      setOcupado(false)
      setCancelando(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Líneas vendidas */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">Productos</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2 text-right">Precio</th>
              <th className="px-3 py-2 text-right">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pedido.lineas.map((l) => (
              <tr key={l.id} className={l.alerta_precio ? 'bg-amber-50/50' : undefined}>
                <td className="px-3 py-2 text-slate-700">
                  {l.producto_nombre}
                  {l.alerta_precio && <span className="ml-1.5 text-xs text-amber-700">⚠ precio</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatoNum(l.cantidad, 3)} {l.producto_unidad}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatoMXN(l.precio_unitario)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{formatoMXN(l.importe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pedido.notas && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            <span className="font-medium">Notas:</span> {pedido.notas}
          </p>
        )}
      </div>

      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pagos */}
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pagos</h4>
            <span className={`text-xs ${restante > 0.005 ? 'text-rose-600' : 'text-emerald-700'}`}>
              {restante > 0.005 ? `Falta ${formatoMXN(restante)}` : 'Pagado completo'}
            </span>
          </div>

          {pagos.length > 0 ? (
            <ul className="mb-2 divide-y divide-slate-100 text-sm">
              {pagos.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-slate-600">
                    {p.fecha} · <span className="font-medium text-slate-800">{formatoMXN(p.monto)}</span>
                    {p.metodo && <span className="text-slate-400"> · {p.metodo}</span>}
                    {p.referencia && <span className="text-slate-400"> · {p.referencia}</span>}
                  </span>
                  <button onClick={() => borrarPago(p)} className="text-xs text-rose-500 hover:text-rose-700">Borrar</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-xs text-slate-400">Sin pagos registrados.</p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input type="date" value={pago.fecha} onChange={(e) => setPago((p) => ({ ...p, fecha: e.target.value }))} className={MINI} />
            <input type="number" min="0" step="0.01" placeholder="Monto" value={pago.monto}
              onChange={(e) => setPago((p) => ({ ...p, monto: e.target.value }))} className={MINI} />
            <select value={pago.metodo} onChange={(e) => setPago((p) => ({ ...p, metodo: e.target.value }))} className={MINI}>
              {METODOS_PAGO_VENTA.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input placeholder="Referencia" value={pago.referencia}
              onChange={(e) => setPago((p) => ({ ...p, referencia: e.target.value }))} className={MINI} />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            {restante > 0.005 && (
              <button
                onClick={() => setPago((p) => ({ ...p, monto: String(restante) }))}
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Saldar {formatoMXN(restante)}
              </button>
            )}
            <button onClick={agregarPago} disabled={ocupado}
              className="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-60">
              + Agregar pago
            </button>
          </div>
        </div>

        {/* Facturas */}
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Facturas</h4>

          {facturas.length > 0 ? (
            <ul className="mb-2 divide-y divide-slate-100 text-sm">
              {facturas.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-slate-600">
                    <span className="font-medium text-slate-800">{f.folio}</span>
                    {f.fecha && <span className="text-slate-400"> · {f.fecha}</span>}
                    {f.monto != null && <span className="text-slate-400"> · {formatoMXN(f.monto)}</span>}
                  </span>
                  <button onClick={() => borrarFactura(f)} className="text-xs text-rose-500 hover:text-rose-700">Borrar</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-2 text-xs text-slate-400">Sin facturas registradas.</p>
          )}

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              ref={archivoRef}
              type="file"
              accept=".xml,text/xml,.pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importarArchivo(f)
              }}
            />
            <button
              type="button"
              onClick={() => archivoRef.current?.click()}
              disabled={importando}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {importando ? 'Leyendo…' : '📄 Importar CFDI o PDF'}
            </button>
            <span className="text-[11px] text-slate-400">rellena folio/fecha/monto/UUID — revisa antes de guardar</span>
          </div>
          {importado && (
            <p className={`mb-2 rounded-md px-2.5 py-1.5 text-xs ${importado.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {importado.mensaje}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input placeholder="Folio *" value={fact.folio} onChange={(e) => setFact((f) => ({ ...f, folio: e.target.value }))} className={MINI} />
            <input type="date" value={fact.fecha} onChange={(e) => setFact((f) => ({ ...f, fecha: e.target.value }))} className={MINI} />
            <input type="number" min="0" step="0.01" placeholder="Monto" value={fact.monto}
              onChange={(e) => setFact((f) => ({ ...f, monto: e.target.value }))} className={MINI} />
            <input placeholder="UUID CFDI" value={fact.uuid_fiscal}
              onChange={(e) => setFact((f) => ({ ...f, uuid_fiscal: e.target.value }))} className={MINI} />
          </div>
          <div className="mt-2 flex justify-end">
            <button onClick={agregarFactura} disabled={ocupado}
              className="rounded-md bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-60">
              + Agregar factura
            </button>
          </div>
        </div>
      </div>

      {/* Cancelar pedido */}
      {pedido.estado === 'abierta' && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3">
          {!cancelando ? (
            <button onClick={() => setCancelando(true)} className="text-xs font-medium text-rose-600 hover:text-rose-800">
              Cancelar este pedido…
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-rose-700">
                Cancelar repone el inventario de sus líneas. Las facturas y pagos ya registrados NO se
                borran — quedan como evidencia de lo que pasó.
              </p>
              <input
                placeholder="Motivo de la cancelación *"
                value={motivoCancela}
                onChange={(e) => setMotivoCancela(e.target.value)}
                className={MINI}
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setCancelando(false)} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-white">
                  No cancelar
                </button>
                <button onClick={cancelarPedido} disabled={ocupado}
                  className="rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-60">
                  Confirmar cancelación
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
