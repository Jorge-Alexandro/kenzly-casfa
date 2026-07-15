'use client'

// Alta/edición de oportunidad. Los productos de interés reusan el catálogo de
// Ventas (ventas_producto); el importe por línea y el monto sugerido se
// calculan aquí solo como vista previa — el servidor recalcula todo.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Modal from './Modal'
import { LABEL, INPUT, SELECT, BTN_PRIMARIO, BTN_SECUNDARIO, claseMensaje } from './ui'
import { formatoMXN } from '@/lib/ventas/tipos'
import { nombreMiembro, type MiembroOrg, type OportunidadRow } from '@/lib/crm/tipos'

export interface ProductoOpcion {
  id: string
  nombre: string
  linea: string
  unidad: string
}

interface ItemDraft {
  producto_id: string
  cantidad: string
  precio_objetivo: string
}

export default function OportunidadFormModal({
  abierto,
  onCerrar,
  cuentas,
  cuentaFija,
  productos,
  miembros,
  oportunidad,
}: {
  abierto: boolean
  onCerrar: () => void
  cuentas: { id: string; nombre: string }[]
  cuentaFija?: string // si viene, la cuenta no se elige (ficha 360°)
  productos: ProductoOpcion[]
  miembros: MiembroOrg[]
  oportunidad?: OportunidadRow // presente = edición (campos generales)
}) {
  const router = useRouter()
  const [cuentaId, setCuentaId] = useState(cuentaFija ?? oportunidad?.cuenta_id ?? '')
  const [nombre, setNombre] = useState(oportunidad?.nombre ?? '')
  const [monto, setMonto] = useState(oportunidad ? String(oportunidad.monto_estimado) : '')
  const [probabilidad, setProbabilidad] = useState(oportunidad ? String(oportunidad.probabilidad) : '50')
  const [fechaCierre, setFechaCierre] = useState(oportunidad?.fecha_cierre_estimada ?? '')
  const [origen, setOrigen] = useState(oportunidad?.origen ?? '')
  const [responsableId, setResponsableId] = useState(oportunidad?.responsable_id ?? '')
  const [notas, setNotas] = useState(oportunidad?.notas ?? '')
  const [items, setItems] = useState<ItemDraft[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalItems = useMemo(
    () =>
      items.reduce((s, it) => {
        const c = Number(it.cantidad)
        const p = Number(it.precio_objetivo)
        return Number.isFinite(c) && Number.isFinite(p) ? s + c * p : s
      }, 0),
    [items],
  )

  function actualizarItem(i: number, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  }

  async function guardar() {
    setError(null)
    setGuardando(true)
    try {
      const itemsValidos = items.filter((it) => it.producto_id && Number(it.cantidad) > 0)
      const res = await fetch('/api/crm/oportunidades', {
        method: oportunidad ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(oportunidad
            ? { id: oportunidad.id }
            : {
                cuenta_id: cuentaId,
                items: itemsValidos.map((it) => ({
                  producto_id: it.producto_id,
                  cantidad: Number(it.cantidad),
                  precio_objetivo: Number(it.precio_objetivo) || 0,
                })),
              }),
          nombre,
          monto_estimado: monto === '' ? undefined : Number(monto),
          probabilidad: Number(probabilidad),
          fecha_cierre_estimada: fechaCierre || null,
          origen,
          notas,
          responsable_id: responsableId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? `Error ${res.status}`)
      } else {
        onCerrar()
        router.refresh()
      }
    } catch (e) {
      setError((e as Error).message)
    }
    setGuardando(false)
  }

  const puedeGuardar =
    nombre.trim() !== '' && (oportunidad || cuentaId) && Number(probabilidad) >= 0 && Number(probabilidad) <= 100 && !guardando

  return (
    <Modal
      titulo={oportunidad ? 'Editar oportunidad' : 'Nueva oportunidad'}
      abierto={abierto}
      onCerrar={onCerrar}
      ancho="max-w-2xl"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!oportunidad && !cuentaFija && (
          <div className="sm:col-span-2">
            <label className={LABEL}>Cuenta *</label>
            <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className={SELECT}>
              <option value="">— Elegir cuenta —</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label className={LABEL}>Nombre de la oportunidad *</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={INPUT} placeholder="Café tostado 2026 — 2 toneladas" />
        </div>
        <div>
          <label className={LABEL}>Monto estimado (MXN)</label>
          <input type="number" min="0" step="any" value={monto} onChange={(e) => setMonto(e.target.value)} className={INPUT} placeholder={totalItems > 0 ? `${totalItems.toFixed(2)} (de productos)` : ''} />
        </div>
        <div>
          <label className={LABEL}>Probabilidad (%)</label>
          <input type="number" min="0" max="100" value={probabilidad} onChange={(e) => setProbabilidad(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Fecha estimada de cierre</label>
          <input type="date" value={fechaCierre} onChange={(e) => setFechaCierre(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Responsable</label>
          <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className={SELECT}>
            <option value="">— Sin asignar —</option>
            {miembros.map((m) => (
              <option key={m.id} value={m.id}>{nombreMiembro(m)}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Origen</label>
          <input value={origen} onChange={(e) => setOrigen(e.target.value)} className={INPUT} placeholder="Feria, referido, cliente actual…" />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Notas</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className={INPUT} />
        </div>
      </div>

      {/* Productos de interés — solo en alta; en edición se administran desde la ficha */}
      {!oportunidad && (
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <p className={LABEL}>Productos de interés (catálogo de Ventas)</p>
            <button
              onClick={() => setItems((prev) => [...prev, { producto_id: '', cantidad: '', precio_objetivo: '' }])}
              className={BTN_SECUNDARIO}
            >
              + Producto
            </button>
          </div>
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">Opcional. Si agregas productos y dejas el monto vacío, se calcula con su suma.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_5rem_6rem_2rem] items-center gap-2">
                  <select
                    value={it.producto_id}
                    onChange={(e) => actualizarItem(i, { producto_id: e.target.value })}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-orange-500 focus:outline-none"
                    aria-label="Producto"
                  >
                    <option value="">— Producto —</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>[{p.linea}] {p.nombre}</option>
                    ))}
                  </select>
                  <input
                    type="number" min="0" step="any" placeholder="Cant."
                    value={it.cantidad}
                    onChange={(e) => actualizarItem(i, { cantidad: e.target.value })}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums focus:border-orange-500 focus:outline-none"
                    aria-label="Cantidad"
                  />
                  <input
                    type="number" min="0" step="any" placeholder="Precio"
                    value={it.precio_objetivo}
                    onChange={(e) => actualizarItem(i, { precio_objetivo: e.target.value })}
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums focus:border-orange-500 focus:outline-none"
                    aria-label="Precio objetivo"
                  />
                  <button
                    onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                    className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                    aria-label="Quitar producto"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              ))}
              <p className="text-right text-sm text-slate-500">
                Suma de productos: <span className="font-semibold tabular-nums text-slate-700">{formatoMXN(totalItems)}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className={claseMensaje('error')}>{error}</p>}

      <div className="mt-4 flex justify-end">
        <button onClick={guardar} disabled={!puedeGuardar} className={BTN_PRIMARIO}>
          {guardando ? 'Guardando…' : oportunidad ? 'Guardar cambios' : 'Crear oportunidad'}
        </button>
      </div>
    </Modal>
  )
}
