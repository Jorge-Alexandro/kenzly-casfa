'use client'

// Alta de un contrato de fijación. El vendedor sale del padrón (con snapshot
// editable); el tipo de café elige la plantilla y con ella la unidad/moneda y
// las cláusulas. El importe se calcula en vivo, pero el SERVIDOR lo recalcula y
// congela las cláusulas al guardar: aquí no se decide nada legalmente vinculante.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { fmtDinero, type ContratoPlantilla, type VendedorLite } from '@/lib/contratos/tipos'

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
  const [vendedor, setVendedor] = useState({
    vendedor_nombre: '', vendedor_domicilio: '', vendedor_curp: '', vendedor_rfc: '',
    vendedor_telefono: '', comunidad: '', municipio: '',
  })
  const [prodTipo, setProdTipo] = useState(plantillas[0] ? `${plantillas[0].especie}|${plantillas[0].tipo}` : '')
  const [terminos, setTerminos] = useState({
    cantidad: '', precio_unitario: '', anticipo: '', fecha: hoy(), fecha_entrega: '', ciclo: '',
  })
  const [arbitraje, setArbitraje] = useState<'nacional' | 'internacional'>('nacional')
  const [observaciones, setObservaciones] = useState('')

  const plantilla = useMemo(
    () => plantillas.find((p) => `${p.especie}|${p.tipo}` === prodTipo) ?? null,
    [plantillas, prodTipo],
  )

  const importe = useMemo(() => {
    const c = Number(terminos.cantidad) || 0
    const p = Number(terminos.precio_unitario) || 0
    return Math.round(c * p * 100) / 100
  }, [terminos.cantidad, terminos.precio_unitario])

  function elegirProductor(id: string) {
    setProductorId(id)
    const p = productores.find((x) => x.id === id)
    if (p) {
      // El padrón sólo trae CURP; RFC y teléfono se dejan como estén (captura manual).
      setVendedor((v) => ({
        ...v,
        vendedor_nombre: p.nombre_completo,
        vendedor_curp: p.curp ?? '',
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
          ...vendedor,
          productor_id: productorId || null,
          especie: plantilla.especie,
          tipo: plantilla.tipo,
          unidad: plantilla.unidad,
          moneda: plantilla.moneda,
          ...terminos,
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

      {/* Vendedor */}
      <Seccion titulo="Vendedor (productor)">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Del padrón">
            <select value={productorId} onChange={(e) => elegirProductor(e.target.value)} className={INPUT}>
              <option value="">— Capturar a mano —</option>
              {productores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo ? `${p.codigo} · ` : ''}{p.nombre_completo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Nombre del vendedor *">
            <input value={vendedor.vendedor_nombre} onChange={set(setVendedor, 'vendedor_nombre')} className={INPUT} />
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
          <Campo label={`Cantidad (${plantilla?.unidad ?? 'unidad'}) *`}>
            <input type="number" min="0" step="0.001" inputMode="decimal"
              value={terminos.cantidad} onChange={set(setTerminos, 'cantidad')} className={INPUT} />
          </Campo>
          <Campo label={`Precio por ${plantilla?.unidad ?? 'unidad'} (${plantilla?.moneda ?? 'MXN'}) *`}>
            <input type="number" min="0" step="0.01" inputMode="decimal"
              value={terminos.precio_unitario} onChange={set(setTerminos, 'precio_unitario')} className={INPUT} />
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

        <div className="mt-3 flex items-center justify-between rounded-md bg-orange-50 px-4 py-2.5">
          <span className="text-sm text-slate-600">Importe del contrato</span>
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
