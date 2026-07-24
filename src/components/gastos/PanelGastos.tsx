'use client'

// Gastos por programa. Reemplaza el libro de Excel de Emily y Francisco: se
// captura el movimiento suelto (fecha, categoría, monto) y la matriz fecha ×
// categoría con la columna TOTAL se arma sola — los totales no pueden
// descuadrar porque nadie los suma a mano.
import { Fragment, useMemo, useState } from 'react'
import {
  construirMatriz, fmtMXN, fmtCelda,
  type Gasto, type ProgramaGasto,
} from '@/lib/gastos/tipos'

const hoy = () => new Date().toISOString().slice(0, 10)

export default function PanelGastos({
  programas,
  gastosIniciales,
}: {
  programas: ProgramaGasto[]
  gastosIniciales: Gasto[]
}) {
  const [rows, setRows] = useState(gastosIniciales)
  const [claveActiva, setClaveActiva] = useState(programas[0]?.clave ?? '')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const programa = programas.find((p) => p.clave === claveActiva) ?? programas[0]
  const cats = programa?.categorias ?? []

  const [form, setForm] = useState({
    fecha: hoy(), categoria_id: '', monto: '', concepto: '', beneficiario: '', comprobante: '',
  })

  const filtrados = useMemo(
    () =>
      rows.filter((g) => {
        if (!programa || g.programa_id !== programa.id) return false
        if (desde && g.fecha < desde) return false
        if (hasta && g.fecha > hasta) return false
        return true
      }),
    [rows, programa, desde, hasta],
  )
  const matriz = useMemo(() => construirMatriz(filtrados), [filtrados])

  async function agregar() {
    setError(null)
    if (!form.categoria_id) return setError('Elige la categoría del gasto.')
    if (!(Number(form.monto) > 0)) return setError('El monto debe ser mayor a 0.')
    setOcupado(true)
    try {
      const res = await fetch('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo registrar el gasto')
      setRows((rs) => [...rs, { ...data.gasto, monto: Number(data.gasto.monto) }])
      setForm((f) => ({ ...f, monto: '', concepto: '', beneficiario: '', comprobante: '' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar el gasto')
    } finally {
      setOcupado(false)
    }
  }

  async function borrar(g: Gasto) {
    const cat = cats.find((c) => c.id === g.categoria_id)?.nombre ?? 'gasto'
    if (!confirm(`¿Borrar el ${cat.toLowerCase()} de ${fmtMXN(g.monto)} del ${g.fecha}?`)) return
    setError(null)
    const res = await fetch(`/api/gastos?id=${g.id}`, { method: 'DELETE' })
    if (!res.ok) return setError('No se pudo borrar el movimiento')
    setRows((rs) => rs.filter((x) => x.id !== g.id))
  }

  const qs = new URLSearchParams()
  if (programa) qs.set('programa', programa.clave)
  if (desde) qs.set('desde', desde)
  if (hasta) qs.set('hasta', hasta)

  if (!programa) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
        No hay programas de gasto configurados.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Programa + periodo + descarga */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {programas.map((p) => (
            <button
              key={p.clave}
              onClick={() => { setClaveActiva(p.clave); setForm((f) => ({ ...f, categoria_id: '' })); setAbierta(null) }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                p.clave === claveActiva ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {p.nombre}
            </button>
          ))}
        </div>
        <label className="text-xs text-slate-500">
          <span className="mb-0.5 block">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={INPUT} />
        </label>
        <label className="text-xs text-slate-500">
          <span className="mb-0.5 block">Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={INPUT} />
        </label>
        {(desde || hasta) && (
          <button
            onClick={() => { setDesde(''); setHasta('') }}
            className="rounded-md border border-slate-300 px-2.5 py-2 text-xs text-slate-600 hover:bg-white"
          >
            Todo el histórico
          </button>
        )}
        <a
          href={`/api/gastos/export?${qs.toString()}`}
          className="ml-auto rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Descargar Excel
        </a>
      </div>

      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {/* Captura */}
      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Registrar gasto de {programa.nombre}
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <label className="text-xs text-slate-500">
            <span className="mb-0.5 block">Fecha *</span>
            <input type="date" value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} className={INPUT} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-0.5 block">Categoría *</span>
            <select value={form.categoria_id}
              onChange={(e) => setForm((f) => ({ ...f, categoria_id: e.target.value }))} className={INPUT}>
              <option value="">Elegir…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-0.5 block">Monto *</span>
            <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
              value={form.monto} onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
              className={`${INPUT} text-right`} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-0.5 block">Concepto</span>
            <input value={form.concepto} placeholder="Para qué fue"
              onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))} className={INPUT} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-0.5 block">Beneficiario</span>
            <input value={form.beneficiario} placeholder="A quién se le pagó"
              onChange={(e) => setForm((f) => ({ ...f, beneficiario: e.target.value }))} className={INPUT} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="mb-0.5 block">Comprobante</span>
            <input value={form.comprobante} placeholder="Factura / recibo"
              onChange={(e) => setForm((f) => ({ ...f, comprobante: e.target.value }))} className={INPUT} />
          </label>
        </div>
        <div className="mt-2 flex justify-end">
          <button onClick={agregar} disabled={ocupado}
            className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60">
            + Agregar gasto
          </button>
        </div>
      </section>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tot label="Movimientos" value={String(matriz.movimientos)} />
        <Tot label="Días con gasto" value={String(matriz.filas.length)} />
        <Tot label={`Total ${programa.nombre}`} value={fmtMXN(matriz.granTotal)} destacado />
        <Tot
          label="Categoría más alta"
          value={(() => {
            const top = cats
              .map((c) => [c.nombre, matriz.totalPorCategoria[c.id] ?? 0] as const)
              .sort((a, b) => b[1] - a[1])[0]
            return top && top[1] > 0 ? `${top[0]} · ${fmtMXN(top[1])}` : '—'
          })()}
        />
      </div>

      {/* Matriz fecha × categoría */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5 text-left">Fecha</th>
              {cats.map((c) => (
                <th key={c.id} className="px-3 py-2.5 text-right whitespace-nowrap">{c.nombre}</th>
              ))}
              <th className="px-3 py-2.5 text-right">Total</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {matriz.filas.map((fila) => {
              const abiertaEsta = abierta === fila.fecha
              return (
                <Fragment key={fila.fecha}>
                  <tr className={abiertaEsta ? 'bg-orange-50/40' : undefined}>
                    <td className="px-3 py-2 font-medium text-slate-700">{fila.fecha}</td>
                    {cats.map((c) => (
                      <td key={c.id} className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {fmtCelda(fila.porCategoria[c.id])}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">
                      {fmtMXN(fila.total)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => setAbierta(abiertaEsta ? null : fila.fecha)}
                        className="whitespace-nowrap text-xs font-medium text-orange-700 hover:underline"
                      >
                        {abiertaEsta ? 'Cerrar' : `${fila.movimientos.length} mov.`}
                      </button>
                    </td>
                  </tr>
                  {abiertaEsta && (
                    <tr>
                      <td colSpan={cats.length + 3} className="bg-slate-50/70 px-3 py-3">
                        <ul className="divide-y divide-slate-200 text-sm">
                          {fila.movimientos.map((g) => (
                            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                              <span className="text-slate-600">
                                <span className="font-medium text-slate-800">
                                  {cats.find((c) => c.id === g.categoria_id)?.nombre ?? '—'}
                                </span>
                                {' · '}{fmtMXN(g.monto)}
                                {g.concepto && <span className="text-slate-400"> · {g.concepto}</span>}
                                {g.beneficiario && <span className="text-slate-400"> · {g.beneficiario}</span>}
                                {g.comprobante && <span className="text-slate-400"> · {g.comprobante}</span>}
                              </span>
                              <button onClick={() => borrar(g)} className="text-xs text-rose-500 hover:text-rose-700">
                                Borrar
                              </button>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
          {matriz.filas.length > 0 && (
            <tfoot className="bg-slate-50 font-semibold text-slate-700">
              <tr>
                <td className="px-3 py-2">TOTAL</td>
                {cats.map((c) => (
                  <td key={c.id} className="px-3 py-2 text-right tabular-nums">
                    {fmtCelda(matriz.totalPorCategoria[c.id])}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">{fmtMXN(matriz.granTotal)}</td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          )}
        </table>
        {matriz.filas.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">
            Sin gastos de {programa.nombre} en este periodo.
          </p>
        )}
      </div>
    </div>
  )
}

const INPUT = 'w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800'

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
