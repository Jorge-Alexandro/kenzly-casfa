'use client'

// Bitácora grid editor (faithful to the CASFA .docx): activities × (12 months ×
// 2 quincenas) checkboxes + gastos, an insumos sub-table and observaciones.
// Works in two modes: 'nueva' (pick parcela + año) and 'editar' (parcela fixed).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MESES,
  emptyInsumo,
  bitacoraVacia,
  type BitacoraDatos,
  type BitacoraActividad,
  type BitacoraInsumo,
} from '@/lib/bitacora'
import type { ParcelaLite } from '@/lib/types'
import { codigoCorto } from '@/lib/format'
import { enviarOEncolarBitacora } from '@/lib/offline/sync'

interface Props {
  mode: 'nueva' | 'editar'
  parcelas?: ParcelaLite[] // requerido en 'nueva'
  parcelaFija?: { id: string; label: string } // en 'editar' o vinculada a ficha
  anioInicial: number
  datosIniciales?: BitacoraDatos
  fichaId?: string // si la bitácora es anexo de una ficha
}

export default function BitacoraEditor({
  mode,
  parcelas = [],
  parcelaFija,
  anioInicial,
  datosIniciales,
  fichaId,
}: Props) {
  const router = useRouter()
  const [parcelaId, setParcelaId] = useState(parcelaFija?.id ?? '')
  const [anio, setAnio] = useState(anioInicial)
  const [datos, setDatos] = useState<BitacoraDatos>(
    datosIniciales ?? bitacoraVacia(),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardadaOffline, setGuardadaOffline] = useState(false)

  function setActividad(id: string, patch: Partial<BitacoraActividad>) {
    setDatos((d) => ({
      ...d,
      actividades: d.actividades.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    }))
  }

  function toggleMarca(id: string, col: number) {
    setDatos((d) => ({
      ...d,
      actividades: d.actividades.map((a) => {
        if (a.id !== id) return a
        const marcas = [...a.marcas]
        marcas[col] = !marcas[col]
        return { ...a, marcas }
      }),
    }))
  }

  function setInsumo(i: number, patch: Partial<BitacoraInsumo>) {
    setDatos((d) => ({
      ...d,
      insumos: d.insumos.map((ins, idx) => (idx === i ? { ...ins, ...patch } : ins)),
    }))
  }

  async function guardar() {
    if (!parcelaId) {
      setError('Selecciona una parcela')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Offline-aware: con red se guarda; sin red se encola y se sube sola.
      const etiqueta =
        parcelaFija?.label ??
        (() => {
          const p = parcelas.find((x) => x.id === parcelaId)
          return p ? `Bitácora · ${p.nombre || p.codigo_parcela} (${anio})` : `Bitácora (${anio})`
        })()
      const r = await enviarOEncolarBitacora(
        { parcela_id: parcelaId, anio, datos, ficha_id: fichaId ?? null },
        etiqueta,
      )
      if (r.online && r.id) {
        router.push(`/bitacora/${r.id}`)
        router.refresh()
      } else {
        setGuardadaOffline(true)
        setTimeout(() => router.push('/bitacora'), 1500)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setBusy(false)
    }
  }

  const manejo = datos.actividades.filter((a) => a.grupo === 'manejo')
  const cosecha = datos.actividades.filter((a) => a.grupo === 'cosecha')

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Encabezado: parcela + año */}
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Parcela
          </label>
          {mode === 'nueva' ? (
            <ParcelaBuscador
              parcelas={parcelas}
              value={parcelaId}
              onChange={setParcelaId}
            />
          ) : (
            <div className="text-sm font-medium text-slate-800">
              {parcelaFija?.label}
            </div>
          )}
        </div>
        <div className="w-28">
          <label className="mb-1 block text-sm font-medium text-slate-700">Año</label>
          <input
            type="number"
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400"
          />
        </div>
        <button
          disabled={busy}
          onClick={guardar}
          className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {busy ? 'Guardando…' : 'Guardar bitácora'}
        </button>
      </div>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-600">{error}</p>
      )}
      {guardadaOffline && (
        <p className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-700">
          Sin conexión: la bitácora se guardó en el dispositivo y se subirá sola
          al recuperar señal.
        </p>
      )}

      {/* Manejo en campo (sin título, a pedido del SIC) */}
      <GridActividades
        actividades={manejo}
        onMarca={toggleMarca}
        onActividad={setActividad}
      />

      {/* Actividades de cosecha */}
      <GridActividades
        actividades={cosecha}
        onMarca={toggleMarca}
        onActividad={setActividad}
      />

      {/* Cosecha por especie: fecha + kg EN UVA, separado árabe/robusta */}
      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <CosechaEspecie
            titulo="Café Arábica"
            fecha={datos.cosecha.arabica_fecha}
            fechaFin={datos.cosecha.arabica_fecha_fin}
            kg={datos.cosecha.arabica_kg_uva}
            onFecha={(v) => setDatos((d) => ({ ...d, cosecha: { ...d.cosecha, arabica_fecha: v } }))}
            onFechaFin={(v) => setDatos((d) => ({ ...d, cosecha: { ...d.cosecha, arabica_fecha_fin: v } }))}
            onKg={(v) => setDatos((d) => ({ ...d, cosecha: { ...d.cosecha, arabica_kg_uva: v } }))}
          />
          <CosechaEspecie
            titulo="Café Robusta"
            fecha={datos.cosecha.robusta_fecha}
            fechaFin={datos.cosecha.robusta_fecha_fin}
            kg={datos.cosecha.robusta_kg_uva}
            onFecha={(v) => setDatos((d) => ({ ...d, cosecha: { ...d.cosecha, robusta_fecha: v } }))}
            onFechaFin={(v) => setDatos((d) => ({ ...d, cosecha: { ...d.cosecha, robusta_fecha_fin: v } }))}
            onKg={(v) => setDatos((d) => ({ ...d, cosecha: { ...d.cosecha, robusta_kg_uva: v } }))}
          />
        </div>
      </section>

      {/* Insumos */}
      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Sustancias para control de plagas, malezas y enfermedades
          </h2>
          <button
            onClick={() =>
              setDatos((d) => ({ ...d, insumos: [...d.insumos, emptyInsumo()] }))
            }
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            + Producto
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="p-1 font-medium">Nombre del producto</th>
                <th className="p-1 font-medium">Ingrediente activo</th>
                <th className="p-1 font-medium">Ingredientes inertes</th>
                <th className="p-1 font-medium">Origen</th>
                <th className="p-1 font-medium">Dosis kg/ha</th>
                <th className="p-1 font-medium">Fecha aplicación</th>
              </tr>
            </thead>
            <tbody>
              {datos.insumos.map((ins, i) => (
                <tr key={i}>
                  <InsumoCell value={ins.nombre_producto} onChange={(v) => setInsumo(i, { nombre_producto: v })} />
                  <InsumoCell value={ins.ingrediente_activo} onChange={(v) => setInsumo(i, { ingrediente_activo: v })} />
                  <InsumoCell value={ins.ingredientes_inertes} onChange={(v) => setInsumo(i, { ingredientes_inertes: v })} />
                  <InsumoCell value={ins.origen} onChange={(v) => setInsumo(i, { origen: v })} />
                  <InsumoCell value={ins.dosis_kg_ha} onChange={(v) => setInsumo(i, { dosis_kg_ha: v })} />
                  <InsumoCell value={ins.fecha_aplicacion} onChange={(v) => setInsumo(i, { fecha_aplicacion: v })} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Observaciones */}
      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="mb-1 block text-sm font-semibold uppercase tracking-wide text-slate-500">
          Observaciones
        </label>
        <textarea
          rows={3}
          value={datos.observaciones}
          onChange={(e) => setDatos((d) => ({ ...d, observaciones: e.target.value }))}
          className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400"
        />
      </section>
    </div>
  )
}

// Buscador de parcela por nombre/código (reemplaza el <select> largo).
function ParcelaBuscador({
  parcelas,
  value,
  onChange,
}: {
  parcelas: ParcelaLite[]
  value: string
  onChange: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const seleccionada = parcelas.find((p) => p.id === value)
  const query = q.trim().toLowerCase()
  const filtradas = query
    ? parcelas.filter(
        (p) =>
          (p.nombre ?? '').toLowerCase().includes(query) ||
          p.codigo_parcela.toLowerCase().includes(query),
      )
    : parcelas
  return (
    <div className="relative">
      <input
        value={abierto ? q : seleccionada ? `${seleccionada.nombre || codigoCorto(seleccionada.codigo_parcela, seleccionada.nombre)} · ${codigoCorto(seleccionada.codigo_parcela, seleccionada.nombre)}` : q}
        onChange={(e) => { setQ(e.target.value); setAbierto(true) }}
        onFocus={() => { setQ(''); setAbierto(true) }}
        placeholder="Buscar parcela por nombre o código…"
        className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400"
      />
      {abierto && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {filtradas.slice(0, 60).map((p) => {
            const cod = codigoCorto(p.codigo_parcela, p.nombre)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange(p.id); setAbierto(false); setQ('') }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-orange-50"
              >
                <span className="font-medium text-slate-800">{p.nombre || cod}</span>
                <span className="ml-2 text-xs text-slate-400">{cod}</span>
              </button>
            )
          })}
          {filtradas.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-400">Sin coincidencias</p>
          )}
        </div>
      )}
    </div>
  )
}

// Cosecha por especie: fecha + kg en uva.
function CosechaEspecie({
  titulo,
  fecha,
  fechaFin,
  kg,
  onFecha,
  onFechaFin,
  onKg,
}: {
  titulo: string
  fecha: string
  fechaFin: string
  kg: number | null
  onFecha: (v: string) => void
  onFechaFin: (v: string) => void
  onKg: (v: number | null) => void
}) {
  return (
    <div className="rounded-md border border-slate-100 p-3">
      <p className="mb-2 text-sm font-semibold text-slate-700">{titulo}</p>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Inicio de cosecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => onFecha(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-slate-500">Término de cosecha</span>
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => onFechaFin(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400"
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-slate-500">Cosecha en uva (kg)</span>
        <input
          type="number"
          step="0.1"
          value={kg ?? ''}
          onChange={(e) => onKg(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400"
        />
      </label>
    </div>
  )
}

function GridActividades({
  titulo,
  actividades,
  onMarca,
  onActividad,
}: {
  titulo?: string
  actividades: BitacoraActividad[]
  onMarca: (id: string, col: number) => void
  onActividad: (id: string, patch: Partial<BitacoraActividad>) => void
}) {
  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
      {titulo && (
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {titulo}
        </h2>
      )}
      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border border-slate-300 bg-slate-50 p-1 text-left">
                Actividad
              </th>
              {MESES.map((m) => (
                <th key={m} colSpan={2} className="border border-slate-300 bg-slate-50 p-1 text-center">
                  {m}
                </th>
              ))}
              <th className="border border-slate-300 bg-slate-50 p-1 text-center">Gastos</th>
            </tr>
            <tr>
              <th className="sticky left-0 z-10 border border-slate-300 bg-slate-50 p-1"></th>
              {MESES.map((m) => (
                <FragmentQuincena key={m} />
              ))}
              <th className="border border-slate-300 bg-slate-50 p-1"></th>
            </tr>
          </thead>
          <tbody>
            {actividades.map((a) => (
              <tr key={a.id}>
                <td className="sticky left-0 z-10 whitespace-nowrap border border-slate-300 bg-white p-1 font-medium text-slate-700">
                  {a.nombre}
                  {a.detalle !== undefined && (
                    <input
                      value={a.detalle}
                      onChange={(e) => onActividad(a.id, { detalle: e.target.value })}
                      placeholder="detalle…"
                      className="ml-2 w-32 rounded border border-slate-200 px-1 py-0.5 text-xs"
                    />
                  )}
                </td>
                {a.marcas.map((on, col) => (
                  <td key={col} className="border border-slate-200 p-0 text-center">
                    <button
                      onClick={() => onMarca(a.id, col)}
                      className={`h-6 w-6 ${on ? 'bg-orange-500 text-white' : 'hover:bg-slate-100'}`}
                      title={`${MESES[Math.floor(col / 2)]} ${col % 2 === 0 ? '15' : '30'}`}
                    >
                      {on ? '✓' : ''}
                    </button>
                  </td>
                ))}
                <td className="border border-slate-300 p-0">
                  <input
                    type="number"
                    value={a.gastos ?? ''}
                    onChange={(e) =>
                      onActividad(a.id, {
                        gastos: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="w-20 px-1 py-0.5 text-xs outline-none"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function FragmentQuincena() {
  return (
    <>
      <th className="border border-slate-300 bg-slate-50 p-1 text-center text-[10px] text-slate-400">15</th>
      <th className="border border-slate-300 bg-slate-50 p-1 text-center text-[10px] text-slate-400">30</th>
    </>
  )
}

function InsumoCell({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <td className="p-0.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs outline-none focus:border-orange-400"
      />
    </td>
  )
}
