'use client'

// Captura del costo por boleta. El precio/kg se teclea, el importe se calcula en
// vivo (precio × kg netos) y el servidor lo recalcula al guardar. Guarda por
// renglón al salir del campo (onBlur); un aviso confirma cada guardado.
import { useMemo, useState } from 'react'
import { fmtMXN, fmtNum, type BoletaCosto } from '@/lib/contabilidad/tipos'

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export default function TablaCostos({ boletas }: { boletas: BoletaCosto[] }) {
  const [rows, setRows] = useState(boletas)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<'todas' | 'sin_precio' | 'con_saldo'>('todas')
  const [guardando, setGuardando] = useState<string | null>(null)
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

  const tot = useMemo(() => {
    return visibles.reduce(
      (a, b) => ({
        kg: a.kg + b.kg_netos,
        qq: a.qq + (b.quintales ?? 0),
        importe: a.importe + (b.importe ?? 0),
        pagado: a.pagado + b.importe_pagado,
      }),
      { kg: 0, qq: 0, importe: 0, pagado: 0 },
    )
  }, [visibles])

  function editar(id: string, campo: 'precio_kg' | 'importe_pagado' | 'factura', valor: string) {
    setRows((rs) =>
      rs.map((b) => {
        if (b.id !== id) return b
        if (campo === 'factura') return { ...b, factura: valor || null }
        const n = valor === '' ? null : Number(valor)
        if (campo === 'precio_kg') {
          const importe = n == null ? null : Math.round(n * b.kg_netos * 100) / 100
          return { ...b, precio_kg: n, importe }
        }
        return { ...b, importe_pagado: n ?? 0 }
      }),
    )
  }

  async function guardar(b: BoletaCosto) {
    setError(null)
    setGuardando(b.id)
    try {
      const res = await fetch('/api/contabilidad/costo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entrada_id: b.id,
          precio_kg: b.precio_kg,
          importe_pagado: b.importe_pagado,
          factura: b.factura,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
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

      {/* Totales de lo filtrado */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tot label={`Boletas`} value={String(visibles.length)} />
        <Tot label="Kg netos" value={fmtNum(tot.kg, 1)} />
        <Tot label="Quintales" value={fmtNum(tot.qq, 2)} />
        <Tot label="Importe" value={fmtMXN(tot.importe)} destacado />
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
              <th className="px-3 py-2.5">Factura</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((b) => (
              <tr key={b.id} className={guardando === b.id ? 'bg-orange-50/40' : undefined}>
                <td className="px-3 py-2 font-semibold text-slate-700">{b.folio}</td>
                <td className="px-3 py-2">
                  <div className="max-w-[14rem] truncate text-slate-800">{b.proveedor_nombre}</div>
                  <div className="text-xs text-slate-400">{b.fecha_acopio}</div>
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {b.especie} <span className="text-slate-400">{b.tipo}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtNum(b.kg_netos, 1)}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal"
                    value={b.precio_kg ?? ''}
                    onChange={(e) => editar(b.id, 'precio_kg', e.target.value)}
                    onBlur={() => guardar(b)}
                    className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{fmtMXN(b.importe)}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal"
                    value={b.importe_pagado || ''}
                    onChange={(e) => editar(b.id, 'importe_pagado', e.target.value)}
                    onBlur={() => guardar(b)}
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                  />
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${saldo(b) > 0.005 ? 'text-rose-600' : 'text-slate-400'}`}>
                  {fmtMXN(saldo(b))}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={b.factura ?? ''}
                    onChange={(e) => editar(b.id, 'factura', e.target.value)}
                    onBlur={() => guardar(b)}
                    placeholder="—"
                    className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">Ninguna boleta con ese filtro.</p>
        )}
      </div>
    </div>
  )
}

const saldo = (b: BoletaCosto) => (b.importe ?? 0) - b.importe_pagado

function Tot({ label, value, destacado }: { label: string; value: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destacado ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${destacado ? 'text-orange-700' : 'text-slate-800'}`}>
        {value}
      </div>
    </div>
  )
}
