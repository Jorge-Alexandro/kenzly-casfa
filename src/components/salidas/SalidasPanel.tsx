'use client'

// Salidas del almacén: alta de la salida física (operativo) y, sólo para
// Contabilidad, captura del precio de venta en las mismas filas.
// El importe se muestra en vivo pero lo recalcula el servidor al guardar.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ESTADO_SALIDA_LABEL, ESTADO_SALIDA_BADGE, fmtMXN, fmtNum,
  type SalidaConVenta,
} from '@/lib/salidas/tipos'
import type { ProductoCatalogo } from '@/lib/acopio/tipos'

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const VACIO = {
  fecha: '', guia: '', cliente: '', destino: '', especie: '', tipo: '',
  sacos: '', kg: '', responsable: '', transporte: '', placas: '', observaciones: '',
}

export default function SalidasPanel({
  salidas,
  catalogo,
  puedeVerDinero,
}: {
  salidas: SalidaConVenta[]
  catalogo: ProductoCatalogo[]
  puedeVerDinero: boolean
}) {
  const router = useRouter()
  const [rows, setRows] = useState(salidas)
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState(salidas.length === 0)
  const [form, setForm] = useState({ ...VACIO, fecha: hoy() })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const especies = useMemo(() => Array.from(new Set(catalogo.map((c) => c.especie))), [catalogo])
  const tipos = useMemo(
    () => catalogo.filter((c) => c.especie === form.especie).map((c) => c.tipo),
    [catalogo, form.especie],
  )

  const visibles = useMemo(() => {
    const q = norm(busqueda)
    if (!q) return rows
    return rows.filter((s) =>
      norm(`${s.folio} ${s.cliente} ${s.guia ?? ''} ${s.especie ?? ''} ${s.tipo ?? ''} ${s.responsable ?? ''}`).includes(q),
    )
  }, [rows, busqueda])

  const tot = useMemo(
    () =>
      visibles.reduce(
        (a, s) => ({
          sacos: a.sacos + s.sacos,
          kg: a.kg + s.kg,
          importe: a.importe + (s.venta?.importe ?? 0),
          cobrado: a.cobrado + (s.venta?.importe_cobrado ?? 0),
        }),
        { sacos: 0, kg: 0, importe: 0, cobrado: 0 },
      ),
    [visibles],
  )

  const set = (k: keyof typeof VACIO) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const v = e.target.value
    setForm((f) => (k === 'especie' ? { ...f, especie: v, tipo: '' } : { ...f, [k]: v }))
  }

  async function crear() {
    setError(null)
    if (!form.cliente.trim()) return setError('Escribe el cliente o destinatario.')
    if (!(Number(form.kg) > 0) && !(Number(form.sacos) > 0)) {
      return setError('Captura la cantidad (sacos o kilos).')
    }
    setGuardando(true)
    try {
      const res = await fetch('/api/salidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo registrar la salida')
      setForm({ ...VACIO, fecha: hoy() })
      setAbierto(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setGuardando(false)
    }
  }

  function editarVenta(id: string, campo: 'precio_kg' | 'importe_cobrado' | 'factura', valor: string) {
    setRows((rs) =>
      rs.map((s) => {
        if (s.id !== id) return s
        const v = s.venta ?? { precio_kg: null, importe: null, moneda: 'MXN', importe_cobrado: 0, factura: null }
        if (campo === 'factura') return { ...s, venta: { ...v, factura: valor || null } }
        const n = valor === '' ? null : Number(valor)
        if (campo === 'precio_kg') {
          return { ...s, venta: { ...v, precio_kg: n, importe: n == null ? null : Math.round(n * s.kg * 100) / 100 } }
        }
        return { ...s, venta: { ...v, importe_cobrado: n ?? 0 } }
      }),
    )
  }

  async function guardarVenta(s: SalidaConVenta) {
    setError(null)
    try {
      const res = await fetch(`/api/salidas/${s.id}/venta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          precio_kg: s.venta?.precio_kg,
          importe_cobrado: s.venta?.importe_cobrado,
          factura: s.venta?.factura,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar el precio')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar folio, cliente, guía, responsable…"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={() => setAbierto((v) => !v)}
          className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          {abierto ? 'Cerrar' : '+ Nueva salida'}
        </button>
      </div>

      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {/* Alta de salida física */}
      {abierto && (
        <section className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Nueva salida
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="Fecha"><input type="date" value={form.fecha} onChange={set('fecha')} className={INPUT} /></Campo>
            <Campo label="Guía de salida"><input value={form.guia} onChange={set('guia')} className={INPUT} /></Campo>
            <Campo label="Cliente / destinatario *"><input value={form.cliente} onChange={set('cliente')} className={INPUT} /></Campo>
            <Campo label="Destino"><input value={form.destino} onChange={set('destino')} className={INPUT} /></Campo>
            <Campo label="Especie">
              <select value={form.especie} onChange={set('especie')} className={INPUT}>
                <option value="">—</option>
                {especies.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </Campo>
            <Campo label="Tipo">
              <select value={form.tipo} onChange={set('tipo')} disabled={!form.especie} className={INPUT}>
                <option value="">—</option>
                {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Campo>
            <Campo label="Sacos"><input type="number" min="0" step="0.01" value={form.sacos} onChange={set('sacos')} className={INPUT} /></Campo>
            <Campo label="Kilos"><input type="number" min="0" step="0.01" value={form.kg} onChange={set('kg')} className={INPUT} /></Campo>
            <Campo label="Responsable de la salida"><input value={form.responsable} onChange={set('responsable')} className={INPUT} /></Campo>
            <Campo label="Transporte"><input value={form.transporte} onChange={set('transporte')} className={INPUT} /></Campo>
            <Campo label="Placas"><input value={form.placas} onChange={set('placas')} className={INPUT} /></Campo>
            <Campo label="Observaciones"><input value={form.observaciones} onChange={set('observaciones')} className={INPUT} /></Campo>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={crear}
              disabled={guardando}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Registrar salida'}
            </button>
          </div>
        </section>
      )}

      {/* Totales */}
      <div className={`grid grid-cols-2 gap-3 ${puedeVerDinero ? 'sm:grid-cols-5' : 'sm:grid-cols-3'}`}>
        <Tot label="Salidas" value={String(visibles.length)} />
        <Tot label="Sacos" value={fmtNum(tot.sacos, 2)} />
        <Tot label="Kilos" value={fmtNum(tot.kg, 1)} />
        {puedeVerDinero && <Tot label="Importe" value={fmtMXN(tot.importe, '')} destacado />}
        {puedeVerDinero && <Tot label="Por cobrar" value={fmtMXN(tot.importe - tot.cobrado, '')} />}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Folio</th>
              <th className="px-3 py-2.5">Fecha</th>
              <th className="px-3 py-2.5">Guía</th>
              <th className="px-3 py-2.5">Cliente</th>
              <th className="px-3 py-2.5">Producto</th>
              <th className="px-3 py-2.5 text-right">Sacos</th>
              <th className="px-3 py-2.5 text-right">Kilos</th>
              <th className="px-3 py-2.5">Responsable</th>
              <th className="px-3 py-2.5">Estado</th>
              {puedeVerDinero && <th className="px-3 py-2.5 text-right">Precio/kg</th>}
              {puedeVerDinero && <th className="px-3 py-2.5 text-right">Importe</th>}
              {puedeVerDinero && <th className="px-3 py-2.5 text-right">Cobrado</th>}
              {puedeVerDinero && <th className="px-3 py-2.5">Factura</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 font-semibold text-slate-700">{s.folio}</td>
                <td className="px-3 py-2 text-slate-600">{s.fecha}</td>
                <td className="px-3 py-2 text-slate-600">{s.guia ?? '—'}</td>
                <td className="px-3 py-2">
                  <div className="max-w-[14rem] truncate text-slate-800">{s.cliente}</div>
                  {s.destino && <div className="text-xs text-slate-400">{s.destino}</div>}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {s.especie ? `${s.especie} ${s.tipo ?? ''}` : (s.producto_texto ?? '—')}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtNum(s.sacos, 2)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtNum(s.kg, 1)}</td>
                <td className="px-3 py-2 text-slate-600">{s.responsable ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_SALIDA_BADGE[s.estado]}`}>
                    {ESTADO_SALIDA_LABEL[s.estado]}
                  </span>
                </td>
                {puedeVerDinero && (
                  <>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" min="0" step="0.01" inputMode="decimal"
                        value={s.venta?.precio_kg ?? ''}
                        onChange={(e) => editarVenta(s.id, 'precio_kg', e.target.value)}
                        onBlur={() => guardarVenta(s)}
                        className="w-20 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">
                      {fmtMXN(s.venta?.importe ?? null, '')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number" min="0" step="0.01" inputMode="decimal"
                        value={s.venta?.importe_cobrado || ''}
                        onChange={(e) => editarVenta(s.id, 'importe_cobrado', e.target.value)}
                        onBlur={() => guardarVenta(s)}
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-right text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={s.venta?.factura ?? ''}
                        onChange={(e) => editarVenta(s.id, 'factura', e.target.value)}
                        onBlur={() => guardarVenta(s)}
                        placeholder="—"
                        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">Aún no hay salidas registradas.</p>
        )}
      </div>
    </div>
  )
}

const INPUT = 'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm'
const hoy = () => new Date().toISOString().slice(0, 10)

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}

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
