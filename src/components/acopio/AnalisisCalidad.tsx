'use client'

// Análisis de calidad de la muestra (Doc R.3 "Procedimiento para Muestreo y
// Acopio"). El almacenista captura los GRAMOS que lee en la báscula y la app
// hace la cuenta que hoy hace la tabla impresa del manual:
//
//   MUESTRA DE 300 g  →  se trilla  →  oro (g)     ⇒ rendimiento = oro / 300
//                     →  se escoge  →  cerezo (g)  ⇒ cerezo      = cerezo / 300
//   100 g DE CAFÉ ORO →  zaranda 16 · zaranda 15 · caracol · mancha (g)
//                        ⇒ cada uno / 100   (los cuatro suman los 100 g)
//
// El % se muestra en vivo con el MISMO motor que corre el servidor, y el
// servidor lo vuelve a calcular al guardar: aquí nadie teclea porcentajes.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  calcularCalidad,
  aplicaRendimiento,
  soloHumedad,
  gramosDesdeFracciones,
} from '@/lib/acopio/calidad.mjs'
import type { EntradaDetalle, ProductoCatalogo } from '@/lib/acopio/tipos'

const CAMPOS_OK = ['oro_g', 'cerezo_g', 'zaranda_16_g', 'zaranda_15_g', 'caracol_g', 'mancha_g'] as const
type CampoG = (typeof CAMPOS_OK)[number]

const txt = (v: number | null | undefined) => (v == null ? '' : String(v))
const pct = (f: number | null) =>
  f == null ? '—' : `${(Math.round(f * 10000) / 100).toLocaleString('es-MX')} %`

export default function AnalisisCalidad({
  entrada,
  producto,
}: {
  entrada: EntradaDetalle
  producto: ProductoCatalogo | null
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // El café que entró ya en oro no se acopió en pergamino/cereza: no hay
  // rendimiento que medir. Al cacao no se le hace análisis, sólo humedad.
  const conRendimiento = aplicaRendimiento(entrada.especie, entrada.tipo)
  const esCacao = soloHumedad(entrada.especie)

  const cfg = useMemo(
    () => ({ ...(producto ?? {}), rendimiento_aplica: conRendimiento }),
    [producto, conRendimiento],
  )

  // El histórico de AppSheet trae sólo los porcentajes: reconstruimos los gramos
  // para poder mostrarlos en el mismo formulario que las entradas nuevas.
  const inicial = useMemo(() => {
    const g = gramosDesdeFracciones(entrada, cfg)
    const base = Object.fromEntries(
      CAMPOS_OK.map((k) => [k, txt(entrada[k] ?? (g[k] as number | null))]),
    ) as Record<CampoG, string>
    return {
      ...base,
      humedad: txt(entrada.humedad == null ? null : Math.round(entrada.humedad * 10000) / 100),
    }
  }, [entrada, cfg])

  const [form, setForm] = useState(inicial)
  const [cosecha, setCosecha] = useState(entrada.cosecha ?? '')
  const [comentarios, setComentarios] = useState(entrada.comentarios ?? '')

  const r = useMemo(() => calcularCalidad(form, cfg), [form, cfg])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function guardar() {
    setError(null)
    setGuardando(true)
    try {
      const res = await fetch(`/api/acopio/entradas/${entrada.id}/calidad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, cosecha, comentarios }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      setAbierto(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setGuardando(false)
    }
  }

  const muestraG = producto?.muestra_g ?? 300
  const analisisG = producto?.analisis_g ?? 100

  // Qué cuenta como "capturado" depende del producto: al cacao sólo se le toma
  // humedad, así que exigirle rendimiento lo dejaría eternamente "sin capturar".
  const capturado = esCacao
    ? entrada.humedad != null
    : conRendimiento
      ? entrada.rendimiento != null
      : entrada.mancha != null

  const resumen = !capturado
    ? 'Sin capturar'
    : [
        conRendimiento ? `Rendimiento ${pct(entrada.rendimiento)}` : null,
        esCacao ? null : `Mancha ${pct(entrada.mancha)}`,
        `Humedad ${pct(entrada.humedad)}`,
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Análisis de calidad
          </h2>
          <p className="text-xs text-slate-400">{resumen}</p>
        </div>
        <button
          onClick={() => setAbierto((v) => !v)}
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
        >
          {abierto ? 'Cerrar' : capturado ? 'Editar' : 'Capturar'}
        </button>
      </div>

      {abierto && (
        <div className="space-y-5 p-4">
          {/* Rendimiento: la muestra homogeneizada */}
          {conRendimiento && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Muestra homogeneizada — {muestraG} g
              </h3>
              <p className="mb-2 text-xs text-slate-400">
                Se trilla en la morteadora, se sacude el polvo y se pesa el café oro.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Gramos
                  label="Café oro obtenido"
                  v={form.oro_g}
                  on={set('oro_g')}
                  res={pct(r.rendimiento)}
                  resLabel="Rendimiento"
                />
                <Gramos
                  label={entrada.especie === 'ROBUSTA' ? 'Granos negros' : 'Cerezo'}
                  v={form.cerezo_g}
                  on={set('cerezo_g')}
                  res={pct(r.cerezo)}
                  resLabel={entrada.especie === 'ROBUSTA' ? 'Negros' : 'Cerezo'}
                />
              </div>
            </div>
          )}

          {!conRendimiento && !esCacao && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Este café entró ya en <strong>oro</strong>: no se acopió en pergamino ni en cereza, así
              que no hay rendimiento que medir. Se le hacen zarandas, mancha y humedad.
            </p>
          )}

          {esCacao && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Al <strong>cacao</strong> no se le hace análisis de calidad: sólo humedad.
            </p>
          )}

          {/* Tamaño y defectos: los 100 g de oro */}
          {!esCacao && (
            <div>
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {analisisG} g de café oro — tamaño y defectos
              </h3>
              <p className="mb-2 text-xs text-slate-400">
                Los cuatro montones se reparten los mismos {analisisG} g, así que deben sumarlos.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Gramos label="Zaranda 16" v={form.zaranda_16_g} on={set('zaranda_16_g')} res={pct(r.zaranda_16)} />
                <Gramos label="Zaranda 15" v={form.zaranda_15_g} on={set('zaranda_15_g')} res={pct(r.zaranda_15)} />
                <Gramos label="Caracol" v={form.caracol_g} on={set('caracol_g')} res={pct(r.caracol)} />
                <Gramos label="Mancha" v={form.mancha_g} on={set('mancha_g')} res={pct(r.mancha)} />
              </div>
              {r.suma_analisis_g != null && (
                <p
                  className={`mt-2 text-xs ${
                    Math.abs(r.suma_analisis_g - analisisG) > 0.5 ? 'text-amber-700' : 'text-slate-400'
                  }`}
                >
                  Suman {r.suma_analisis_g} g de {analisisG} g.
                </p>
              )}
            </div>
          )}

          {/* Humedad + cosecha */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Humedad (hidrómetro, %)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.humedad}
                onChange={set('humedad')}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-500">Cosecha (temporada)</span>
              <input
                value={cosecha}
                onChange={(e) => setCosecha(e.target.value)}
                placeholder="Temp 2025-2026"
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
              />
            </label>
          </div>

          {/* Avisos de norma (Doc R.3 §3) — informan, no bloquean: rechazar el
              café es decisión del almacenista, no de la app. */}
          {r.avisos.length > 0 && (
            <ul className="list-disc space-y-0.5 rounded-md bg-amber-50 px-6 py-2 text-xs text-amber-800">
              {r.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Observaciones
            </span>
            <textarea
              rows={2}
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
            />
          </label>

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <div className="flex justify-end">
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar análisis'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/** Campo de gramos con su porcentaje calculado debajo. */
function Gramos({
  label,
  v,
  on,
  res,
  resLabel,
}: {
  label: string
  v: string
  on: (e: React.ChangeEvent<HTMLInputElement>) => void
  res: string
  resLabel?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-500">{label} (g)</span>
      <input
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        value={v}
        onChange={on}
        className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
      />
      <span className="mt-1 block text-xs tabular-nums text-slate-600">
        {resLabel && <span className="text-slate-400">{resLabel}: </span>}
        <span className="font-semibold">{res}</span>
      </span>
    </label>
  )
}
