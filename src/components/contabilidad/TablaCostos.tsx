'use client'

// Captura del costo por boleta. El precio/kg se teclea y el importe se calcula
// (el servidor lo recalcula al guardar). El PAGADO ya no se teclea: es la suma
// de los abonos, que se capturan uno por uno en el detalle — así queda la
// evidencia de cómo se fue pagando. Igual las facturas.
import { Fragment, useMemo, useState } from 'react'
import { baseKg, fmtMXN, fmtNum, METODOS_PAGO, type BoletaCosto, type Pago, type Factura } from '@/lib/contabilidad/tipos'

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Kilos sobre los que se paga la boleta (todo el neto, o sólo el excedente FLO). */
const baseDe = (b: BoletaCosto) =>
  baseKg({ es_cooperativa: b.es_cooperativa, kg_netos: b.kg_netos, kg_casfasa: b.kg_casfasa, kg_pagable: b.kg_pagable })

export default function TablaCostos({ boletas }: { boletas: BoletaCosto[] }) {
  const [rows, setRows] = useState(boletas)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<'todas' | 'sin_precio' | 'con_saldo'>('todas')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const visibles = useMemo(() => {
    const q = norm(busqueda)
    return rows.filter((b) => {
      if (q && !norm(`${b.folio} ${b.proveedor_nombre} ${b.especie} ${b.tipo}`).includes(q)) return false
      if (filtro === 'sin_precio' && b.precio_kg != null) return false
      if (filtro === 'con_saldo' && !(saldo(b) > 0.005)) return false
      return true
    })
  }, [rows, busqueda, filtro])

  const tot = useMemo(
    () =>
      visibles.reduce(
        (a, b) => ({
          kg: a.kg + b.kg_netos,
          qq: a.qq + (b.quintales ?? 0),
          importe: a.importe + (b.importe ?? 0),
          pagado: a.pagado + b.importe_pagado,
        }),
        { kg: 0, qq: 0, importe: 0, pagado: 0 },
      ),
    [visibles],
  )

  function editarPrecio(id: string, valor: string) {
    setRows((rs) =>
      rs.map((b) => {
        if (b.id !== id) return b
        const n = valor === '' ? null : Number(valor)
        return { ...b, precio_kg: n, importe: n == null ? null : Math.round(n * baseDe(b) * 100) / 100 }
      }),
    )
  }

  async function guardarPrecio(b: BoletaCosto) {
    setError(null)
    try {
      const res = await fetch('/api/contabilidad/costo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entrada_id: b.id, precio_kg: b.precio_kg }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar el precio')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  /** Reemplaza una boleta en la lista (tras agregar/borrar un abono o factura). */
  const actualizar = (id: string, cambio: Partial<BoletaCosto>) =>
    setRows((rs) => rs.map((b) => (b.id === id ? { ...b, ...cambio } : b)))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar folio, proveedor, café…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {(['todas', 'sin_precio', 'con_saldo'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              filtro === f ? 'bg-orange-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f === 'todas' ? 'Todas' : f === 'sin_precio' ? 'Sin precio' : 'Con saldo'}
          </button>
        ))}
      </div>

      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tot label="Boletas" value={String(visibles.length)} />
        <Tot label="Kg netos" value={fmtNum(tot.kg, 1)} />
        <Tot label="Importe" value={fmtMXN(tot.importe)} destacado />
        <Tot label="Pagado" value={fmtMXN(tot.pagado)} />
        <Tot label="Saldo" value={fmtMXN(tot.importe - tot.pagado)} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Folio</th>
              <th className="px-3 py-2.5">Proveedor</th>
              <th className="px-3 py-2.5">Café</th>
              <th className="px-3 py-2.5 text-right">Kg netos</th>
              <th className="px-3 py-2.5 text-right">Precio/kg</th>
              <th className="px-3 py-2.5 text-right">Importe</th>
              <th className="px-3 py-2.5 text-right">Pagado</th>
              <th className="px-3 py-2.5 text-right">Saldo</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((b) => {
              const abiertaEsta = abierta === b.id
              return (
                <Fragment key={b.id}>
                  <tr className={abiertaEsta ? 'bg-orange-50/40' : undefined}>
                    <td className="px-3 py-2 font-semibold text-slate-700">{b.folio}</td>
                    <td className="px-3 py-2">
                      <div className="flex max-w-[15rem] items-center gap-1.5">
                        <span className="truncate text-slate-800">{b.proveedor_nombre}</span>
                        {b.es_cooperativa && (
                          <span className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700" title="Cooperativa FLO (Finca Chula Vista)">
                            FLO
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">{b.fecha_acopio}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {b.especie} <span className="text-slate-400">{b.tipo}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {fmtNum(b.kg_netos, 1)}
                      {b.es_cooperativa && (
                        <div className="text-xs text-sky-600" title="Kg que paga CASFASA (excedente sobre la estimación)">
                          paga {fmtNum(baseDe(b), 1)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" min="0" step="0.01" inputMode="decimal"
                        value={b.precio_kg ?? ''}
                        onChange={(e) => editarPrecio(b.id, e.target.value)}
                        onBlur={() => guardarPrecio(b)}
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{fmtMXN(b.importe)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {fmtMXN(b.importe_pagado)}
                      <div className="text-xs text-slate-400">
                        {b.pagos.length} pago{b.pagos.length === 1 ? '' : 's'} · {b.facturas.length} fact.
                      </div>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${saldo(b) > 0.005 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {fmtMXN(saldo(b))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setAbierta(abiertaEsta ? null : b.id)}
                        className="whitespace-nowrap text-xs font-medium text-orange-700 hover:underline"
                      >
                        {abiertaEsta ? 'Cerrar' : 'Pagos y facturas'}
                      </button>
                    </td>
                  </tr>
                  {abiertaEsta && (
                    <tr>
                      <td colSpan={9} className="bg-slate-50/70 px-3 py-3">
                        <Detalle boleta={b} onCambio={(c) => actualizar(b.id, c)} onError={setError} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">Ninguna boleta con ese filtro.</p>
        )}
      </div>
    </div>
  )
}

/** Abonos y facturas de una boleta: la evidencia de lo que se lleva pagado. */
function Detalle({
  boleta,
  onCambio,
  onError,
}: {
  boleta: BoletaCosto
  onCambio: (c: Partial<BoletaCosto>) => void
  onError: (m: string | null) => void
}) {
  const [pago, setPago] = useState({ fecha: hoy(), monto: '', metodo: 'Transferencia', referencia: '' })
  const [fact, setFact] = useState({ folio: '', fecha: hoy(), monto: '', uuid_fiscal: '' })
  const [ocupado, setOcupado] = useState(false)
  const [pagable, setPagable] = useState(boleta.kg_pagable == null ? '' : String(boleta.kg_pagable))

  const restante = Math.round(((boleta.importe ?? 0) - boleta.importe_pagado) * 100) / 100

  /** Fija (o libera, con null) los kg que paga CASFASA en esta boleta. */
  async function guardarPagable(valor: string | null) {
    onError(null)
    setOcupado(true)
    try {
      const res = await fetch('/api/contabilidad/costo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entrada_id: boleta.id,
          precio_kg: boleta.precio_kg,
          kg_pagable: valor === '' || valor == null ? null : Number(valor),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron guardar los kilos a pagar')
      const kg = data.kg_pagable == null ? null : Number(data.kg_pagable)
      setPagable(kg == null ? '' : String(kg))
      onCambio({ kg_pagable: kg, importe: data.importe == null ? null : Number(data.importe) })
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error al guardar los kilos a pagar')
    } finally {
      setOcupado(false)
    }
  }

  async function agregarPago() {
    onError(null)
    if (!(Number(pago.monto) > 0)) return onError('El monto del pago debe ser mayor a 0.')
    setOcupado(true)
    try {
      const res = await fetch('/api/contabilidad/pagos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entrada_id: boleta.id, ...pago }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo registrar el pago')
      onCambio({
        pagos: [...boleta.pagos, { ...data.pago, monto: Number(data.pago.monto) }],
        importe_pagado: Number(data.importe_pagado),
      })
      setPago({ fecha: hoy(), monto: '', metodo: pago.metodo, referencia: '' })
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error al registrar el pago')
    } finally {
      setOcupado(false)
    }
  }

  async function borrarPago(p: Pago) {
    if (!confirm(`¿Borrar el pago de ${fmtMXN(p.monto)} del ${p.fecha}?`)) return
    onError(null)
    const res = await fetch(`/api/contabilidad/pagos?id=${p.id}`, { method: 'DELETE' })
    if (!res.ok) return onError('No se pudo borrar el pago')
    const quedan = boleta.pagos.filter((x) => x.id !== p.id)
    onCambio({
      pagos: quedan,
      importe_pagado: Math.round(quedan.reduce((s, x) => s + x.monto, 0) * 100) / 100,
    })
  }

  async function agregarFactura() {
    onError(null)
    if (!fact.folio.trim()) return onError('Escribe el folio de la factura.')
    setOcupado(true)
    try {
      const res = await fetch('/api/contabilidad/facturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entrada_id: boleta.id, ...fact }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo registrar la factura')
      onCambio({
        facturas: [...boleta.facturas, { ...data.factura, monto: data.factura.monto == null ? null : Number(data.factura.monto) }],
      })
      setFact({ folio: '', fecha: hoy(), monto: '', uuid_fiscal: '' })
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error al registrar la factura')
    } finally {
      setOcupado(false)
    }
  }

  async function borrarFactura(f: Factura) {
    if (!confirm(`¿Borrar la factura ${f.folio}?`)) return
    onError(null)
    const res = await fetch(`/api/contabilidad/facturas?id=${f.id}`, { method: 'DELETE' })
    if (!res.ok) return onError('No se pudo borrar la factura')
    onCambio({ facturas: boleta.facturas.filter((x) => x.id !== f.id) })
  }

  return (
    <div className="space-y-4">
      {/* Almacén: qué parte es de la cooperativa FLO y qué parte compra CASFASA */}
      {boleta.es_cooperativa && (
        <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-sky-800">
              Almacén — Cooperativa FLO (Chula Vista)
            </h4>
            <span className="text-xs text-sky-700">
              Sólo se paga lo que rebasa la estimación de cosecha del productor.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini label="Estimación (LPA)" value={`${fmtNum(boleta.estimacion_kg, 1)} kg`} />
            <Mini label="Entregado del ciclo" value={`${fmtNum(boleta.entregado_total, 1)} kg`} />
            <Mini label="Esta boleta → FLO" value={`${fmtNum(boleta.kg_netos - baseDe(boleta), 1)} kg`} nota="no se paga" />
            <Mini label="Esta boleta → CASFASA" value={`${fmtNum(baseDe(boleta), 1)} kg`} nota="se paga" destacado />
          </div>

          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-600">
              <span className="mb-0.5 block">Ajustar kg a pagar</span>
              <input
                type="number" min="0" max={boleta.kg_netos} step="0.1" inputMode="decimal"
                value={pagable}
                placeholder={`auto: ${fmtNum(boleta.kg_casfasa, 1)}`}
                onChange={(e) => setPagable(e.target.value)}
                className="w-32 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
              />
            </label>
            <button
              onClick={() => guardarPagable(pagable)}
              disabled={ocupado}
              className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-800 disabled:opacity-60"
            >
              Guardar
            </button>
            {boleta.kg_pagable != null && (
              <button
                onClick={() => guardarPagable(null)}
                disabled={ocupado}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-white disabled:opacity-60"
              >
                Volver a automático
              </button>
            )}
            <span className="text-xs text-slate-500">
              {boleta.kg_pagable == null
                ? 'Calculado por la estimación del LPA.'
                : 'Ajustado a mano (ignora la estimación en esta boleta).'}
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
      {/* Pagos */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pagos</h4>
          <span className={`text-xs ${restante > 0.005 ? 'text-rose-600' : 'text-emerald-700'}`}>
            {restante > 0.005 ? `Falta ${fmtMXN(restante)}` : boleta.importe ? 'Pagado completo' : 'Sin precio aún'}
          </span>
        </div>

        {boleta.pagos.length > 0 ? (
          <ul className="mb-2 divide-y divide-slate-100 text-sm">
            {boleta.pagos.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-slate-600">
                  {p.fecha} · <span className="font-medium text-slate-800">{fmtMXN(p.monto)}</span>
                  {p.metodo && <span className="text-slate-400"> · {p.metodo}</span>}
                  {p.referencia && <span className="text-slate-400"> · {p.referencia}</span>}
                </span>
                <button onClick={() => borrarPago(p)} className="text-xs text-rose-500 hover:text-rose-700">
                  Borrar
                </button>
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
            {METODOS_PAGO.map((m) => <option key={m} value={m}>{m}</option>)}
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
              Saldar {fmtMXN(restante)}
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

        {boleta.facturas.length > 0 ? (
          <ul className="mb-2 divide-y divide-slate-100 text-sm">
            {boleta.facturas.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-slate-600">
                  <span className="font-medium text-slate-800">{f.folio}</span>
                  {f.fecha && <span className="text-slate-400"> · {f.fecha}</span>}
                  {f.monto != null && <span className="text-slate-400"> · {fmtMXN(f.monto)}</span>}
                </span>
                <button onClick={() => borrarFactura(f)} className="text-xs text-rose-500 hover:text-rose-700">
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-2 text-xs text-slate-400">Sin facturas registradas.</p>
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
    </div>
  )
}

const MINI = 'w-full rounded-md border border-slate-300 px-2 py-1 text-sm'
const hoy = () => new Date().toISOString().slice(0, 10)
const saldo = (b: BoletaCosto) => (b.importe ?? 0) - b.importe_pagado

/** Dato chico del desglose de almacén. */
function Mini({ label, value, nota, destacado }: { label: string; value: string; nota?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-md border bg-white px-2.5 py-1.5 ${destacado ? 'border-sky-300' : 'border-slate-200'}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${destacado ? 'text-sky-800' : 'text-slate-800'}`}>{value}</div>
      {nota && <div className="text-[10px] text-slate-400">{nota}</div>}
    </div>
  )
}

function Tot({ label, value, destacado }: { label: string; value: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destacado ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}>
      <div className={`text-xs ${destacado ? 'text-orange-800' : 'text-slate-500'}`}>{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${destacado ? 'text-orange-700' : 'text-slate-800'}`}>
        {value}
      </div>
    </div>
  )
}
