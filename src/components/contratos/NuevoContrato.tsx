'use client'

// Alta de un contrato de fijación. El vendedor sale del padrón (con snapshot
// editable); el tipo de café elige la plantilla y con ella la unidad/moneda y
// las cláusulas. El importe se calcula en vivo, pero el SERVIDOR lo recalcula y
// congela las cláusulas al guardar: aquí no se decide nada legalmente vinculante.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { fmtDinero, type ContratoPlantilla, type VendedorLite } from '@/lib/contratos/tipos'

/** Minúsculas y sin acentos, para que 'sanchez' encuentre 'Sánchez'. */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export default function NuevoContrato({
  plantillas,
  productores,
  lugarFirma,
}: {
  plantillas: ContratoPlantilla[]
  productores: VendedorLite[]
  lugarFirma: string | null
}) {
  const router = useRouter()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [productorId, setProductorId] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [vendedor, setVendedor] = useState({
    vendedor_nombre: '', vendedor_domicilio: '', vendedor_curp: '', vendedor_rfc: '',
    vendedor_telefono: '', comunidad: '', municipio: '',
  })
  const [prodTipo, setProdTipo] = useState(plantillas[0] ? `${plantillas[0].especie}|${plantillas[0].tipo}` : '')
  // `cantidad` son KILOS y `precio_unitario` es el precio POR KILO. Los otros
  // dos campos (quintales y precio por quintal) son la misma cifra vista de la
  // otra forma: se recalculan solos con el factor del producto.
  const [terminos, setTerminos] = useState({
    cantidad: '', precio_unitario: '', anticipo: '', fecha: hoy(), fecha_entrega: '', ciclo: '',
  })
  const [quintales, setQuintales] = useState('')
  const [precioQuintal, setPrecioQuintal] = useState('')
  const [arbitraje, setArbitraje] = useState<'nacional' | 'internacional'>('nacional')
  const [observaciones, setObservaciones] = useState('')

  const plantilla = useMemo(
    () => plantillas.find((p) => `${p.especie}|${p.tipo}` === prodTipo) ?? null,
    [plantillas, prodTipo],
  )

  // Búsqueda sin acentos por nombre, comunidad y municipio (igual que en acopio).
  const proveedoresFiltrados = useMemo(() => {
    const q = norm(busqueda)
    if (!q) return productores
    return productores.filter((p) =>
      norm([p.nombre_completo, p.comunidad, p.municipio].filter(Boolean).join(' ')).includes(q),
    )
  }, [productores, busqueda])

  // ¿El nombre tecleado no está en el padrón? Entonces al guardar se da de alta.
  const esNuevo = useMemo(() => {
    const n = norm(vendedor.vendedor_nombre)
    return n.length > 0 && !productores.some((p) => norm(p.nombre_completo) === n)
  }, [productores, vendedor.vendedor_nombre])

  // El importe siempre sale de KILOS × PRECIO POR KILO (lo mismo que calcula la
  // columna generada en la base). Los quintales son sólo la otra lectura.
  const importe = useMemo(() => {
    const c = Number(terminos.cantidad) || 0
    const p = Number(terminos.precio_unitario) || 0
    return Math.round(c * p * 100) / 100
  }, [terminos.cantidad, terminos.precio_unitario])

  const factor = plantilla?.factor_quintal ?? null
  const r3 = (n: number) => String(Math.round(n * 1000) / 1000)
  const r4 = (n: number) => String(Math.round(n * 10000) / 10000)

  /** Escribir en un campo actualiza a su pareja usando el factor del producto. */
  function setKilos(v: string) {
    setTerminos((t) => ({ ...t, cantidad: v }))
    if (factor && factor > 0) setQuintales(v === '' ? '' : r3((Number(v) || 0) / factor))
  }
  function setSacos(v: string) {
    setQuintales(v)
    if (factor && factor > 0) {
      setTerminos((t) => ({ ...t, cantidad: v === '' ? '' : r3((Number(v) || 0) * factor) }))
    }
  }
  function setPrecioKg(v: string) {
    setTerminos((t) => ({ ...t, precio_unitario: v }))
    if (factor && factor > 0) setPrecioQuintal(v === '' ? '' : r4((Number(v) || 0) * factor))
  }
  function setPrecioQq(v: string) {
    setPrecioQuintal(v)
    if (factor && factor > 0) {
      setTerminos((t) => ({ ...t, precio_unitario: v === '' ? '' : r4((Number(v) || 0) / factor) }))
    }
  }

  function elegirProductor(id: string) {
    setProductorId(id)
    const p = productores.find((x) => x.id === id)
    if (p) {
      // El padrón de acopio trae nombre/comunidad/municipio; CURP, RFC y
      // teléfono se capturan a mano (no viven en ese padrón).
      setVendedor((v) => ({
        ...v,
        vendedor_nombre: p.nombre_completo,
        comunidad: p.comunidad ?? '',
        municipio: p.municipio ?? '',
      }))
    }
  }

  async function guardar() {
    setError(null)
    if (!plantilla) return setError('Elige el tipo de café.')
    if (!vendedor.vendedor_nombre.trim()) return setError('Falta el nombre del vendedor.')
    if (!(Number(terminos.cantidad) > 0)) return setError('La cantidad debe ser mayor a 0.')
    if (!(Number(terminos.precio_unitario) > 0)) return setError('El precio debe ser mayor a 0.')

    setGuardando(true)
    try {
      const res = await fetch('/api/contratos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // El vendedor viaja como nombre + comunidad/municipio (snapshot). Si no
          // está en el padrón de acopio, el servidor lo da de alta.
          ...vendedor,
          especie: plantilla.especie,
          tipo: plantilla.tipo,
          unidad: plantilla.unidad,
          moneda: plantilla.moneda,
          ...terminos,
          quintales,
          arbitraje,
          observaciones,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo crear el contrato')
      router.push(`/contratos/${data.id}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">Nuevo contrato de fijación</h1>
        <Link href="/contratos" className="text-sm text-slate-500 hover:text-slate-700">← Volver</Link>
      </div>

      {/* Vendedor — sale del padrón de ACOPIO (el mismo de las entradas) */}
      <Seccion titulo="Vendedor (padrón de acopio)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Buscar en el padrón">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre, comunidad o municipio…"
              className={INPUT}
            />
            <select
              value={productorId}
              onChange={(e) => elegirProductor(e.target.value)}
              size={5}
              className={`${INPUT} mt-2`}
            >
              <option value="">— Escribir uno nuevo —</option>
              {proveedoresFiltrados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre_completo}
                  {p.comunidad ? ` · ${p.comunidad}` : ''}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-400">
              {proveedoresFiltrados.length} de {productores.length} proveedores
            </span>
          </Campo>
          <Campo label="Nombre del vendedor *">
            <input value={vendedor.vendedor_nombre} onChange={set(setVendedor, 'vendedor_nombre')} className={INPUT} />
            {esNuevo && (
              <span className="mt-1 block text-xs text-emerald-700">
                Es un vendedor nuevo: se dará de alta solo en el padrón de acopio.
              </span>
            )}
          </Campo>
          <Campo label="Comunidad">
            <input value={vendedor.comunidad} onChange={set(setVendedor, 'comunidad')} className={INPUT} />
          </Campo>
          <Campo label="Municipio">
            <input value={vendedor.municipio} onChange={set(setVendedor, 'municipio')} className={INPUT} />
          </Campo>
          <Campo label="Domicilio">
            <input value={vendedor.vendedor_domicilio} onChange={set(setVendedor, 'vendedor_domicilio')} className={INPUT} />
          </Campo>
          <Campo label="Teléfono">
            <input value={vendedor.vendedor_telefono} onChange={set(setVendedor, 'vendedor_telefono')} className={INPUT} />
          </Campo>
          <Campo label="CURP">
            <input value={vendedor.vendedor_curp} onChange={set(setVendedor, 'vendedor_curp')} className={INPUT} />
          </Campo>
          <Campo label="RFC">
            <input value={vendedor.vendedor_rfc} onChange={set(setVendedor, 'vendedor_rfc')} className={INPUT} />
          </Campo>
        </div>
      </Seccion>

      {/* Producto y términos */}
      <Seccion titulo="Producto y términos">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Tipo de café *">
            <select value={prodTipo} onChange={(e) => setProdTipo(e.target.value)} className={INPUT}>
              {plantillas.map((p) => (
                <option key={`${p.especie}|${p.tipo}`} value={`${p.especie}|${p.tipo}`}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Kilos pactados *">
            <input type="number" min="0" step="0.001" inputMode="decimal"
              value={terminos.cantidad} onChange={(e) => setKilos(e.target.value)} className={INPUT} />
          </Campo>
          <Campo label="Quintales (sacos)">
            <input type="number" min="0" step="0.001" inputMode="decimal"
              value={quintales} onChange={(e) => setSacos(e.target.value)}
              disabled={!factor} className={INPUT} />
          </Campo>
          <Campo label={`Precio por KILO (${plantilla?.moneda ?? 'MXN'}) *`}>
            <input type="number" min="0" step="0.0001" inputMode="decimal"
              value={terminos.precio_unitario} onChange={(e) => setPrecioKg(e.target.value)} className={INPUT} />
          </Campo>
          <Campo label={`Precio por quintal (${plantilla?.moneda ?? 'MXN'})`}>
            <input type="number" min="0" step="0.01" inputMode="decimal"
              value={precioQuintal} onChange={(e) => setPrecioQq(e.target.value)}
              disabled={!factor} className={INPUT} />
          </Campo>
          <Campo label={`Anticipo (${plantilla?.moneda ?? 'MXN'})`}>
            <input type="number" min="0" step="0.01" inputMode="decimal"
              value={terminos.anticipo} onChange={set(setTerminos, 'anticipo')} className={INPUT} />
          </Campo>
          <Campo label="Fecha del contrato">
            <input type="date" value={terminos.fecha} onChange={set(setTerminos, 'fecha')} className={INPUT} />
          </Campo>
          <Campo label="Fecha de entrega">
            <input type="date" value={terminos.fecha_entrega} onChange={set(setTerminos, 'fecha_entrega')} className={INPUT} />
          </Campo>
          <Campo label="Ciclo / temporada">
            <input value={terminos.ciclo} onChange={set(setTerminos, 'ciclo')} placeholder="2025-2026" className={INPUT} />
          </Campo>
        </div>

        <p className="mt-2 text-xs text-slate-400">
          {factor
            ? `Kilos y quintales son la misma cantidad: 1 quintal = ${factor} kg de ${plantilla?.nombre ?? 'este café'}. Escribe en cualquiera de los dos y el otro se ajusta solo.`
            : 'Este producto no maneja quintales (el cacao se pacta sólo por kilo).'}
        </p>

        <div className="mt-3 flex items-center justify-between rounded-md bg-orange-50 px-4 py-2.5">
          <span className="text-sm text-slate-600">
            Importe del contrato
            <span className="ml-2 text-xs text-slate-400">
              {(Number(terminos.cantidad) || 0).toLocaleString('es-MX')} kg ×{' '}
              {fmtDinero(Number(terminos.precio_unitario) || 0, '')}/kg
            </span>
          </span>
          <span className="text-lg font-semibold tabular-nums text-orange-700">
            {fmtDinero(importe, plantilla?.moneda ?? 'MXN')}
          </span>
        </div>

        {plantilla?.calidad_texto && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-600">Calidad pactada: </span>
            {plantilla.calidad_texto}
          </p>
        )}
      </Seccion>

      {/* Arbitraje */}
      <Seccion titulo="Arbitraje">
        <div className="grid gap-2 sm:grid-cols-2">
          <Radio
            checked={arbitraje === 'nacional'}
            onChange={() => setArbitraje('nacional')}
            titulo="Nacional"
            sub="Cámara Nacional de Comercio"
          />
          <Radio
            checked={arbitraje === 'internacional'}
            onChange={() => setArbitraje('internacional')}
            titulo="Internacional"
            sub='Contrato "C" de la Bolsa de Nueva York'
          />
        </div>
        {lugarFirma && (
          <p className="mt-2 text-xs text-slate-400">Lugar de firma: {lugarFirma}</p>
        )}
      </Seccion>

      <Seccion titulo="Observaciones">
        <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={INPUT} />
      </Seccion>

      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <Link href="/contratos" className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
          Cancelar
        </Link>
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-md bg-orange-600 px-5 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Crear contrato'}
        </button>
      </div>
    </div>
  )
}

const INPUT = 'w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm'
const hoy = () => new Date().toISOString().slice(0, 10)

function set<T extends Record<string, string>>(setter: React.Dispatch<React.SetStateAction<T>>, k: keyof T) {
  return (e: React.ChangeEvent<HTMLInputElement>) => setter((s) => ({ ...s, [k]: e.target.value }))
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</h2>
      {children}
    </section>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}

function Radio({ checked, onChange, titulo, sub }: { checked: boolean; onChange: () => void; titulo: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`rounded-lg border px-4 py-3 text-left transition ${
        checked ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-200' : 'border-slate-200 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-3.5 w-3.5 rounded-full border ${checked ? 'border-orange-500 bg-orange-500' : 'border-slate-300'}`} />
        <span className="text-sm font-medium text-slate-800">{titulo}</span>
      </div>
      <p className="mt-0.5 pl-5.5 text-xs text-slate-500">{sub}</p>
    </button>
  )
}
