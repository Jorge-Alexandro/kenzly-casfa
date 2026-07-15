'use client'

// Detalle de entrada: totales, lista de pesadas y captura de una nueva pesada
// con cálculo EN VIVO (mismo motor que el servidor: calculo.mjs). Al guardar o
// borrar, refrescamos para que los totales (que recalcula el trigger) se vean.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { calcularPesada } from '@/lib/acopio/calculo.mjs'
import AnalisisCalidad from './AnalisisCalidad'
import Evidencias from './Evidencias'
import EstadoControl from './EstadoControl'
import { esSupervisor } from '@/lib/acopio/estado'
import type { RolMembresia } from '@/lib/types'
import {
  ESTADO_ENTRADA_LABEL,
  ESTADO_ENTRADA_BADGE,
  type EntradaDetalle as Entrada,
  type ProductoCatalogo,
} from '@/lib/acopio/tipos'

const CAMPOS_CERO = {
  m1_sacos: '', m1_kgs: '', m2_sacos: '', m2_kgs: '',
  plastico: '', yute: '', henequen: '',
}

export default function EntradaDetalle({
  entrada,
  tara,
  producto,
  rol,
}: {
  entrada: Entrada
  tara: Record<string, number>
  producto: ProductoCatalogo | null
  rol: RolMembresia
}) {
  const router = useRouter()
  const [form, setForm] = useState({ ...CAMPOS_CERO })
  const [abierto, setAbierto] = useState(entrada.pesadas.length === 0)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)
  const cerrada = entrada.estado === 'completada' || entrada.estado === 'cancelada'
  const factorQuintal = producto?.factor_quintal ?? null

  const captura = useMemo(
    () => ({
      m1_sacos: +form.m1_sacos || 0,
      m1_kgs: +form.m1_kgs || 0,
      m2_sacos: +form.m2_sacos || 0,
      m2_kgs: +form.m2_kgs || 0,
      plastico: +form.plastico || 0,
      yute: +form.yute || 0,
      henequen: +form.henequen || 0,
    }),
    [form],
  )
  const prev = useMemo(
    () => calcularPesada(captura, { tara, factorQuintal }),
    [captura, tara, factorQuintal],
  )

  const set = (k: keyof typeof CAMPOS_CERO) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function agregar() {
    setError(null)
    if (prev.sacos_total <= 0 || prev.kg_brutos <= 0) {
      return setError('Captura al menos sacos y kilogramos.')
    }
    setGuardando(true)
    try {
      const res = await fetch(`/api/acopio/entradas/${entrada.id}/pesadas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(captura),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo agregar la pesada')
      setForm({ ...CAMPOS_CERO })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Borrar esta pesada?')) return
    const res = await fetch(`/api/acopio/pesadas/${id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
  }

  // Borrar la entrada completa: se lleva pesadas, calidad, fotos y firmas. Por
  // eso pedimos que escriban el folio, no un "¿estás seguro?" que se acepta solo.
  async function borrarEntrada() {
    const escrito = prompt(
      `Esto borra la entrada #${entrada.folio} de ${entrada.proveedor_nombre} con sus ` +
        `${entrada.pesadas.length} pesada(s), fotos y firmas. No se puede deshacer.\n\n` +
        `Escribe el folio (${entrada.folio}) para confirmar:`,
    )
    if (escrito == null) return
    if (escrito.trim() !== String(entrada.folio)) {
      return setError('El folio no coincide. No se borró nada.')
    }
    setError(null)
    setBorrando(true)
    try {
      const res = await fetch(`/api/acopio/entradas/${entrada.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo borrar')
      router.push('/acopio')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
      setBorrando(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-800">Entrada #{entrada.folio}</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_ENTRADA_BADGE[entrada.estado]}`}>
              {ESTADO_ENTRADA_LABEL[entrada.estado]}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-600">{entrada.proveedor_nombre}</p>
          <p className="text-xs text-slate-400">
            {entrada.fecha_acopio} · {entrada.especie} {entrada.tipo}
            {[entrada.comunidad, entrada.municipio].filter(Boolean).length > 0 &&
              ` · ${[entrada.comunidad, entrada.municipio].filter(Boolean).join(', ')}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/api/acopio/entradas/${entrada.id}/pdf`}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
          >
            ↓ Descargar recibo (PDF)
          </a>
          {esSupervisor(rol) && (
            <button
              onClick={borrarEntrada}
              disabled={borrando}
              className="rounded-md border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              {borrando ? 'Borrando…' : 'Borrar entrada'}
            </button>
          )}
          <Link href="/acopio" className="text-sm text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
        </div>
      </div>

      {error && !abierto && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {/* Flujo: avanzar / reabrir / cancelar (el servidor revalida) */}
      <EstadoControl
        entradaId={entrada.id}
        rol={rol}
        actual={{
          estado: entrada.estado,
          num_pesadas: entrada.pesadas.length,
          especie: entrada.especie,
          tipo: entrada.tipo,
          rendimiento: entrada.rendimiento,
          humedad: entrada.humedad,
          firma_receptor_url: entrada.firma_receptor_url,
          firma_proveedor_url: entrada.firma_proveedor_url,
        }}
      />

      {/* Totales de la entrada (los mantiene el trigger) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Total label="Sacos" value={entrada.total_sacos} />
        <Total label="Kg brutos" value={fmt(entrada.kg_brutos)} />
        <Total label="Tara (kg)" value={fmt(entrada.tara_kg)} />
        <Total label="Kg netos" value={fmt(entrada.kg_netos)} destacado />
        <Total label="Quintales" value={entrada.quintales == null ? 'N/A' : fmt(entrada.quintales)} />
        <Total label="Plástico" value={entrada.plastico} />
        <Total label="Yute" value={entrada.yute} />
        <Total label="Henequén" value={entrada.henequen} />
      </div>

      {/* Análisis de la muestra: se captura en gramos, la app saca los % */}
      <AnalisisCalidad entrada={entrada} producto={producto} />

      {/* Pesadas */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pesadas ({entrada.pesadas.length})
          </h2>
          {!cerrada && (
            <button
              onClick={() => setAbierto((v) => !v)}
              className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
            >
              {abierto ? 'Cerrar' : '+ Registrar pesada'}
            </button>
          )}
        </div>

        {entrada.pesadas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2 text-right">Sacos</th>
                  <th className="px-3 py-2 text-right">Kg brutos</th>
                  <th className="px-3 py-2 text-right">Tara</th>
                  <th className="px-3 py-2 text-right">Kg netos</th>
                  <th className="px-3 py-2 text-right">Quintales</th>
                  {!cerrada && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entrada.pesadas.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 font-medium text-slate-700">{p.numero_pesada}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.sacos_total}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(p.kg_brutos)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(p.tara_kg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(p.kg_netos)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.quintales == null ? <span className="text-slate-400">N/A</span> : fmt(p.quintales)}
                    </td>
                    {!cerrada && (
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => borrar(p.id)}
                          className="text-xs text-rose-500 hover:text-rose-700"
                        >
                          Borrar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Captura de nueva pesada con preview en vivo */}
        {abierto && !cerrada && (
          <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Num label="Máq 1 · sacos" v={form.m1_sacos} on={set('m1_sacos')} />
              <Num label="Máq 1 · kgs" v={form.m1_kgs} on={set('m1_kgs')} step="0.01" />
              <Num label="Máq 2 · sacos" v={form.m2_sacos} on={set('m2_sacos')} />
              <Num label="Máq 2 · kgs" v={form.m2_kgs} on={set('m2_kgs')} step="0.01" />
              <Num label="Plástico" v={form.plastico} on={set('plastico')} />
              <Num label="Yute" v={form.yute} on={set('yute')} />
              <Num label="Henequén" v={form.henequen} on={set('henequen')} />
            </div>

            {/* Preview calculado en el cliente con el mismo motor del servidor */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-md bg-white px-3 py-2 text-sm">
              <Chip label="Sacos" value={prev.sacos_total} />
              <Chip label="Brutos" value={fmt(prev.kg_brutos)} />
              <Chip label="Tara" value={fmt(prev.tara_kg)} />
              <Chip label="Netos" value={fmt(prev.kg_netos)} />
              <Chip label="Quintales" value={prev.quintales == null ? 'N/A' : fmt(prev.quintales)} />
            </div>

            {error && (
              <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            )}

            <div className="flex justify-end">
              <button
                onClick={agregar}
                disabled={guardando}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
              >
                {guardando ? 'Guardando…' : 'Agregar pesada'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Fotos y firmas: van al final porque el recibo se firma cuando ya está
          pesado todo el café, no antes. */}
      <Evidencias entrada={entrada} />
    </div>
  )
}

function fmt(n: number) {
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

function Total({ label, value, destacado }: { label: string; value: string | number; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destacado ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${destacado ? 'text-orange-700' : 'text-slate-800'}`}>
        {value}
      </div>
    </div>
  )
}

function Num({
  label, v, on, step,
}: {
  label: string
  v: string
  on: (e: React.ChangeEvent<HTMLInputElement>) => void
  step?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step={step ?? '1'}
        value={v}
        onChange={on}
        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
      />
    </label>
  )
}

function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="text-slate-600">
      <span className="text-slate-400">{label}:</span>{' '}
      <span className="font-semibold tabular-nums text-slate-800">{value}</span>
    </span>
  )
}
