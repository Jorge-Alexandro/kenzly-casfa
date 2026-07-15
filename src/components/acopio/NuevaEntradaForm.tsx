'use client'

// Alta de entrada. La especie se elige del catálogo y el tipo se filtra según
// la especie (§5) — combinaciones inválidas nunca aparecen. El proveedor se
// busca en el padrón; al elegirlo, comunidad/municipio quedan fijos por él.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ProductoCatalogo, ProductorLite } from '@/lib/acopio/tipos'

export default function NuevaEntradaForm({
  catalogo,
  productores,
}: {
  catalogo: ProductoCatalogo[]
  productores: ProductorLite[]
}) {
  const router = useRouter()
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [productorId, setProductorId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [especie, setEspecie] = useState('')
  const [tipo, setTipo] = useState('')
  const [comentarios, setComentarios] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const especies = useMemo(
    () => Array.from(new Set(catalogo.map((c) => c.especie))),
    [catalogo],
  )
  const tipos = useMemo(
    () => catalogo.filter((c) => c.especie === especie).map((c) => c.tipo),
    [catalogo, especie],
  )

  const proveedores = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const base = q
      ? productores.filter(
          (p) =>
            p.nombre_completo.toLowerCase().includes(q) ||
            p.codigo.toLowerCase().includes(q),
        )
      : productores
    return base.slice(0, 50)
  }, [productores, busqueda])

  const proveedorSel = productores.find((p) => p.id === productorId) ?? null

  async function guardar() {
    setError(null)
    if (!proveedorSel) return setError('Selecciona el proveedor.')
    if (!especie || !tipo) return setError('Selecciona especie y tipo.')
    setGuardando(true)
    try {
      const res = await fetch('/api/acopio/entradas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productor_id: productorId,
          proveedor_nombre: proveedorSel.nombre_completo,
          especie,
          tipo,
          fecha_acopio: fecha,
          comentarios: comentarios || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo crear la entrada')
      router.push(`/acopio/${data.id}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Nueva entrada</h1>
          <p className="text-sm text-slate-500">
            El folio se asigna automáticamente al guardar.
          </p>
        </div>
        <Link href="/acopio" className="text-sm text-slate-500 hover:text-slate-700">
          ← Volver
        </Link>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <Campo label="Fecha de acopio">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Campo>

        <Campo label="Proveedor (padrón)">
          <input
            type="text"
            placeholder="Buscar por nombre o código…"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setProductorId('')
            }}
            className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={productorId}
            onChange={(e) => setProductorId(e.target.value)}
            size={6}
            className="w-full rounded-md border border-slate-300 px-1 py-1 text-sm"
          >
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} — {p.nombre_completo}
              </option>
            ))}
          </select>
          {proveedorSel && (
            <p className="mt-1 text-xs text-slate-500">
              {[proveedorSel.comunidad, proveedorSel.municipio].filter(Boolean).join(' · ') ||
                'Sin comunidad/municipio en el padrón'}
            </p>
          )}
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Especie">
            <select
              value={especie}
              onChange={(e) => {
                setEspecie(e.target.value)
                setTipo('')
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {especies.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Tipo">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              disabled={!especie}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            >
              <option value="">—</option>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <Campo label="Comentarios (opcional)">
          <textarea
            value={comentarios}
            onChange={(e) => setComentarios(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </Campo>

        {error && (
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Link
            href="/acopio"
            className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancelar
          </Link>
          <button
            onClick={guardar}
            disabled={guardando}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Crear y empezar a pesar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  )
}
