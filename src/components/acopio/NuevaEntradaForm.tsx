'use client'

// Alta de entrada. La especie se elige del catálogo y el tipo se filtra según
// la especie (§5) — combinaciones inválidas nunca aparecen. El proveedor se
// busca en el padrón; al elegirlo, comunidad/municipio quedan fijos por él.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { ProductoCatalogo, ProductorLite } from '@/lib/acopio/tipos'

/** Minúsculas y sin acentos, para que 'sanchez' encuentre 'Sánchez'. */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** Temporada "Temp 2026-2027" desde la fecha (corte en septiembre). */
const temporadaDe = (iso: string) => {
  const d = iso ? new Date(iso) : new Date()
  const y = d.getFullYear()
  return `Temp ${d.getMonth() + 1 >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`}`
}

export default function NuevaEntradaForm({
  catalogo,
  productores,
}: {
  catalogo: ProductoCatalogo[]
  productores: ProductorLite[]
}) {
  const router = useRouter()
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  // Padrón de proveedores de acopio en estado, para poder dar de alta nuevos.
  const [provs, setProvs] = useState<ProductorLite[]>(productores)
  const [productorId, setProductorId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [especie, setEspecie] = useState('')
  const [tipo, setTipo] = useState('')
  // Temporada de cosecha: arranca sugerida por la fecha y se puede editar. Si el
  // capturista no la ha tocado, se ajusta sola al cambiar la fecha.
  const [cosecha, setCosecha] = useState(() => temporadaDe(new Date().toISOString().slice(0, 10)))
  const [cosechaTocada, setCosechaTocada] = useState(false)
  const [comentarios, setComentarios] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Alta de nuevo proveedor.
  const [altaAbierta, setAltaAbierta] = useState(false)
  const [nuevo, setNuevo] = useState({ nombre: '', comunidad: '', municipio: '' })
  const [creando, setCreando] = useState(false)

  async function crearProveedor() {
    if (!nuevo.nombre.trim()) return setError('Escribe el nombre del proveedor.')
    setCreando(true)
    setError(null)
    try {
      const res = await fetch('/api/acopio/proveedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevo),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo crear')
      setProvs((ps) => [data.proveedor, ...ps.filter((p) => p.id !== data.proveedor.id)])
      setProductorId(data.proveedor.id)
      // Limpiamos la búsqueda: si el texto anterior no coincide con el nombre
      // nuevo, el proveedor quedaría seleccionado pero fuera de la lista visible.
      setBusqueda('')
      setAltaAbierta(false)
      setNuevo({ nombre: '', comunidad: '', municipio: '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear proveedor')
    } finally {
      setCreando(false)
    }
  }

  const especies = useMemo(
    () => Array.from(new Set(catalogo.map((c) => c.especie))),
    [catalogo],
  )
  const tipos = useMemo(
    () => catalogo.filter((c) => c.especie === especie).map((c) => c.tipo),
    [catalogo, especie],
  )

  // Busca por nombre, comunidad y municipio, sin acentos (el padrón escribe
  // 'Sánchez' y el capturista teclea 'sanchez'). NO se recorta la lista: con un
  // tope, los proveedores que caían fuera eran imposibles de seleccionar.
  const proveedores = useMemo(() => {
    const q = norm(busqueda)
    if (!q) return provs
    return provs.filter((p) =>
      norm([p.nombre_completo, p.comunidad, p.municipio].filter(Boolean).join(' ')).includes(q),
    )
  }, [provs, busqueda])

  const proveedorSel = provs.find((p) => p.id === productorId) ?? null

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
          // Proveedor del padrón de ACOPIO (no del padrón de certificación):
          // se guarda por nombre/comunidad/municipio, sin productor_id.
          proveedor_nombre: proveedorSel.nombre_completo,
          comunidad: proveedorSel.comunidad,
          municipio: proveedorSel.municipio,
          especie,
          tipo,
          fecha_acopio: fecha,
          cosecha: cosecha.trim() || null,
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Fecha de acopio">
            <input
              type="date"
              value={fecha}
              onChange={(e) => {
                setFecha(e.target.value)
                if (!cosechaTocada) setCosecha(temporadaDe(e.target.value))
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </Campo>
          <Campo label="Temporada de cosecha">
            <input
              type="text"
              value={cosecha}
              onChange={(e) => {
                setCosecha(e.target.value)
                setCosechaTocada(true)
              }}
              placeholder="Temp 2026-2027"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </Campo>
        </div>

        <Campo label="Proveedor (padrón de acopio)">
          <input
            type="text"
            placeholder="Buscar por nombre, comunidad o municipio…"
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
                {p.nombre_completo}
                {p.comunidad ? ` · ${p.comunidad}` : ''}
              </option>
            ))}
          </select>
          {proveedores.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              Ningún proveedor coincide con «{busqueda}». Dalo de alta con “+ Nuevo proveedor”.
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">
              {proveedores.length} de {provs.length} proveedores
              {proveedorSel ? ' · seleccionado: ' + proveedorSel.nombre_completo : ''}
            </p>
          )}
          {proveedorSel && (
            <p className="mt-0.5 text-xs text-slate-500">
              {[proveedorSel.comunidad, proveedorSel.municipio].filter(Boolean).join(' · ') ||
                'Sin comunidad/municipio en el padrón'}
            </p>
          )}

          {/* Alta de nuevo proveedor (no está en el padrón de acopio) */}
          {!altaAbierta ? (
            <button
              type="button"
              onClick={() => setAltaAbierta(true)}
              className="mt-2 text-xs font-medium text-orange-700 hover:underline"
            >
              + Nuevo proveedor
            </button>
          ) : (
            <div className="mt-2 rounded-md border border-orange-200 bg-orange-50/50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Nuevo proveedor de acopio
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <input placeholder="Nombre *" value={nuevo.nombre} onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm sm:col-span-3" />
                <input placeholder="Comunidad" value={nuevo.comunidad} onChange={(e) => setNuevo((n) => ({ ...n, comunidad: e.target.value }))} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
                <input placeholder="Municipio" value={nuevo.municipio} onChange={(e) => setNuevo((n) => ({ ...n, municipio: e.target.value }))} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
                <button type="button" onClick={crearProveedor} disabled={creando} className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
                  {creando ? 'Guardando…' : 'Agregar y seleccionar'}
                </button>
              </div>
              <button type="button" onClick={() => setAltaAbierta(false)} className="mt-2 text-xs text-slate-500 hover:text-slate-700">Cancelar</button>
            </div>
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
