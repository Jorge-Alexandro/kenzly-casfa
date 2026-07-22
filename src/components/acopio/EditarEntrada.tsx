'use client'

// Corrección de los datos de la boleta (proveedor, fecha, producto, cosecha,
// observaciones). Los TOTALES no se editan aquí: los suma el trigger desde las
// pesadas. Si cambia el producto, el servidor recalcula los quintales con el
// nuevo factor — por eso se avisa antes de guardar.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EntradaDetalle, ProductoCatalogo } from '@/lib/acopio/tipos'

export default function EditarEntrada({
  entrada,
  catalogo,
  onCerrar,
}: {
  entrada: EntradaDetalle
  catalogo: ProductoCatalogo[]
  onCerrar: () => void
}) {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [f, setF] = useState({
    fecha_acopio: entrada.fecha_acopio ?? '',
    proveedor_nombre: entrada.proveedor_nombre ?? '',
    comunidad: entrada.comunidad ?? '',
    municipio: entrada.municipio ?? '',
    especie: entrada.especie,
    tipo: entrada.tipo,
    cosecha: entrada.cosecha ?? '',
    comentarios: entrada.comentarios ?? '',
  })

  const especies = useMemo(
    () => Array.from(new Set(catalogo.map((c) => c.especie))),
    [catalogo],
  )
  const tipos = useMemo(
    () => catalogo.filter((c) => c.especie === f.especie).map((c) => c.tipo),
    [catalogo, f.especie],
  )

  const cambiaProducto = f.especie !== entrada.especie || f.tipo !== entrada.tipo

  const set = (k: keyof typeof f) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const v = e.target.value
    setF((s) => {
      if (k !== 'especie') return { ...s, [k]: v }
      // Al cambiar la especie, el tipo anterior puede no existir para la nueva.
      const nuevos = catalogo.filter((c) => c.especie === v).map((c) => c.tipo)
      return { ...s, especie: v, tipo: nuevos.includes(s.tipo) ? s.tipo : (nuevos[0] ?? '') }
    })
  }

  async function guardar() {
    setError(null)
    if (!f.proveedor_nombre.trim()) return setError('El proveedor no puede quedar vacío.')
    setGuardando(true)
    try {
      const res = await fetch(`/api/acopio/entradas/${entrada.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      onCerrar()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
      setGuardando(false)
    }
  }

  return (
    <section className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Editar datos de la boleta #{entrada.folio}
        </h2>
        <button onClick={onCerrar} className="text-sm text-slate-500 hover:text-slate-700">
          Cancelar
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo label="Fecha de acopio">
          <input type="date" value={f.fecha_acopio} onChange={set('fecha_acopio')} className={INPUT} />
        </Campo>
        <Campo label="Proveedor *">
          <input value={f.proveedor_nombre} onChange={set('proveedor_nombre')} className={INPUT} />
        </Campo>
        <Campo label="Cosecha (temporada)">
          <input value={f.cosecha} onChange={set('cosecha')} placeholder="Temp 2026-2027" className={INPUT} />
        </Campo>
        <Campo label="Comunidad">
          <input value={f.comunidad} onChange={set('comunidad')} className={INPUT} />
        </Campo>
        <Campo label="Municipio">
          <input value={f.municipio} onChange={set('municipio')} className={INPUT} />
        </Campo>
        <div />
        <Campo label="Especie">
          <select value={f.especie} onChange={set('especie')} className={INPUT}>
            {especies.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </Campo>
        <Campo label="Tipo">
          <select value={f.tipo} onChange={set('tipo')} className={INPUT}>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Campo>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Observaciones</span>
        <textarea rows={2} value={f.comentarios} onChange={set('comentarios')} className={INPUT} />
      </label>

      {cambiaProducto && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Vas a cambiar el producto de <strong>{entrada.especie} {entrada.tipo}</strong> a{' '}
          <strong>{f.especie} {f.tipo}</strong>. Cambia el factor de quintal, así que se
          <strong> recalcularán los quintales</strong> de las {entrada.pesadas.length} pesada(s) y el
          total de la boleta.
        </p>
      )}

      {error && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onCerrar}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </section>
  )
}

const INPUT = 'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}
