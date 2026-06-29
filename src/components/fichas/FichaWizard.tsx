'use client'

// Ficha capture wizard (Modulo 3). Steps:
//   1. Tipo de ficha (robusta / arabe / tropicales)
//   2. Productor (filtered by the ficha's cultivo)
//   3. Parcelas del productor (multi-select + suma de superficie)
//   4. Formulario dinamico (secciones/campos del template)
// Saves via POST /api/fichas.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  FormTemplate,
  ProductorLite,
  ParcelaLite,
  TipoFicha,
  FormCampo,
} from '@/lib/types'
import {
  TIPO_FICHA_LABEL,
  TIPO_FICHA_CULTIVO,
} from '@/lib/types'
import SignaturePad from './SignaturePad'
import { codigoCorto } from '@/lib/format'
import { enviarOEncolar } from '@/lib/offline/sync'

type Respuestas = Record<string, string | number | null>

export default function FichaWizard({
  templates,
  productores,
  parcelas,
}: {
  templates: FormTemplate[]
  productores: ProductorLite[]
  parcelas: ParcelaLite[]
}) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [tipo, setTipo] = useState<TipoFicha | null>(null)
  const [productorId, setProductorId] = useState<string | null>(null)
  const [parcelaIds, setParcelaIds] = useState<string[]>([])
  const [respuestas, setRespuestas] = useState<Respuestas>({})
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardadaOffline, setGuardadaOffline] = useState(false)
  const [prodQuery, setProdQuery] = useState('')

  // The template that matches the chosen tipo (by cultivo).
  const template = useMemo(() => {
    if (!tipo) return null
    const cultivo = TIPO_FICHA_CULTIVO[tipo]
    // café has two fichas (robusta/arabe) sharing cultivo — disambiguate by name.
    return (
      templates.find(
        (t) =>
          t.tipo_cultivo === cultivo &&
          t.nombre.toLowerCase().includes(tipo === 'arabe' ? 'aráb' : tipo),
      ) ?? templates.find((t) => t.tipo_cultivo === cultivo) ?? null
    )
  }, [tipo, templates])

  // Productores compatible with the ficha cultivo.
  const productoresFiltrados = useMemo(() => {
    if (!tipo) return []
    const cultivo = TIPO_FICHA_CULTIVO[tipo]
    const q = prodQuery.trim().toLowerCase()
    return productores
      .filter((p) => p.tipo_productor === cultivo || p.tipo_productor === 'mixto')
      .filter(
        (p) =>
          !q ||
          p.nombre_completo.toLowerCase().includes(q) ||
          p.codigo.toLowerCase().includes(q),
      )
  }, [tipo, productores, prodQuery])

  // Parcelas of the chosen productor.
  const parcelasProductor = useMemo(
    () => (productorId ? parcelas.filter((p) => p.productor_id === productorId) : []),
    [productorId, parcelas],
  )

  const areaTotal = useMemo(
    () =>
      parcelasProductor
        .filter((p) => parcelaIds.includes(p.id))
        .reduce((s, p) => s + (Number(p.superficie_declarada_ha) || 0), 0),
    [parcelasProductor, parcelaIds],
  )

  const productor = productores.find((p) => p.id === productorId)

  function setCampo(nombre: string, value: string | number | null) {
    setRespuestas((r) => ({ ...r, [nombre]: value }))
  }

  function toggleParcela(id: string) {
    setParcelaIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    )
  }

  async function guardar(estado: 'borrador' | 'en_revision') {
    if (!tipo || !productorId || parcelaIds.length === 0) return
    setBusy(true)
    setError(null)
    try {
      // Offline-aware: si hay red la sube; si no, la guarda en el dispositivo
      // y se sincroniza sola al volver la conexión.
      const r = await enviarOEncolar(
        {
          tipo,
          template_id: template?.id ?? null,
          productor_id: productorId,
          parcela_ids: parcelaIds,
          fecha_inspeccion: fecha,
          respuestas,
          estado,
        },
        `${TIPO_FICHA_LABEL[tipo]} · ${productor?.nombre_completo ?? ''}`,
      )
      if (r.online) {
        router.push('/fichas')
        router.refresh()
      } else {
        // Guardada offline: avisa y vuelve a la lista de fichas.
        setGuardadaOffline(true)
        setTimeout(() => router.push('/fichas'), 1500)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Steps step={step} />

      {/* STEP 1: tipo */}
      {step === 1 && (
        <Card title="¿Qué tipo de ficha vas a levantar?">
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(TIPO_FICHA_LABEL) as TipoFicha[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTipo(t)
                  setProductorId(null)
                  setParcelaIds([])
                  setStep(2)
                }}
                className={`rounded-lg border p-4 text-left transition hover:border-orange-400 ${
                  tipo === t ? 'border-orange-400 bg-orange-50' : 'border-slate-200'
                }`}
              >
                <div className="font-medium text-slate-800">
                  {TIPO_FICHA_LABEL[t]}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {TIPO_FICHA_CULTIVO[t] === 'cafe' ? 'Café' : 'Tropical'}
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* STEP 2: productor */}
      {step === 2 && tipo && (
        <Card title="Selecciona el productor">
          <input
            value={prodQuery}
            onChange={(e) => setProdQuery(e.target.value)}
            placeholder="Buscar por nombre o código…"
            className="mb-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
          />
          <div className="max-h-80 overflow-y-auto rounded-md border border-slate-100">
            {productoresFiltrados.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setProductorId(p.id)
                  setParcelaIds([])
                  setStep(3)
                }}
                className={`flex w-full items-center justify-between border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  productorId === p.id ? 'bg-orange-50' : ''
                }`}
              >
                <span className="font-medium text-slate-800">
                  {p.nombre_completo}
                </span>
                <span className="text-xs text-slate-400">{p.codigo}</span>
              </button>
            ))}
            {productoresFiltrados.length === 0 && (
              <p className="p-4 text-sm text-slate-400">Sin coincidencias.</p>
            )}
          </div>
          <NavButtons onBack={() => setStep(1)} />
        </Card>
      )}

      {/* STEP 3: parcelas */}
      {step === 3 && productor && (
        <Card title={`Parcelas de ${productor.nombre_completo}`}>
          {parcelasProductor.length === 0 ? (
            <p className="text-sm text-amber-600">
              Este productor no tiene parcelas registradas.
            </p>
          ) : (
            <div className="space-y-2">
              {parcelasProductor.map((p) => {
                const checked = parcelaIds.includes(p.id)
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-center justify-between rounded-md border p-3 ${
                      checked ? 'border-orange-400 bg-orange-50' : 'border-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleParcela(p.id)}
                        className="h-4 w-4 accent-orange-500"
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-800">
                          {p.nombre || p.codigo_parcela}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {codigoCorto(p.codigo_parcela, p.nombre)}
                        </span>
                      </span>
                    </span>
                    <span className="text-sm text-slate-500">
                      {p.superficie_declarada_ha !== null
                        ? `${Number(p.superficie_declarada_ha).toFixed(2)} ha`
                        : '—'}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-slate-500">
              {parcelaIds.length} parcela(s) · {areaTotal.toFixed(2)} ha
            </span>
          </div>

          <NavButtons
            onBack={() => setStep(2)}
            onNext={parcelaIds.length > 0 ? () => setStep(4) : undefined}
          />
        </Card>
      )}

      {/* STEP 4: dynamic form */}
      {step === 4 && template && (
        <div>
          <Card title="Datos de la inspección">
            <Field label="Fecha de inspección">
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
              />
            </Field>
          </Card>

          {template.secciones.map((sec) => (
            <Card key={sec.id} title={sec.nombre}>
              <div className="space-y-4">
                {sec.campos.map((campo) => (
                  <DynamicField
                    key={campo.id}
                    campo={campo}
                    value={respuestas[campo.nombre_interno] ?? null}
                    onChange={(v) => setCampo(campo.nombre_interno, v)}
                  />
                ))}
              </div>
            </Card>
          ))}

          {error && (
            <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-600">
              {error}
            </p>
          )}
          {guardadaOffline && (
            <p className="mb-3 rounded-md bg-amber-50 p-2 text-sm text-amber-700">
              Sin conexión: la ficha se guardó en el dispositivo y se subirá
              automáticamente al recuperar señal.
            </p>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(3)}
              className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              ← Atrás
            </button>
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => guardar('borrador')}
                className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Guardar borrador
              </button>
              <button
                disabled={busy}
                onClick={() => guardar('en_revision')}
                className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {busy ? 'Guardando…' : 'Enviar a revisión'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- field renderer ---
function DynamicField({
  campo,
  value,
  onChange,
}: {
  campo: FormCampo
  value: string | number | null
  onChange: (v: string | number | null) => void
}) {
  // Short answers (enum/number/date) use a capped width; free text fills it.
  const short = campo.tipo === 'enum' || campo.tipo === 'number' || campo.tipo === 'date'
  const base = `${short ? 'w-full max-w-xs' : 'w-full'} rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400`

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {campo.etiqueta}
      </label>
      {campo.imagen_referencia_url && (
        // Reference image (fixed guide), shown above the input.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={campo.imagen_referencia_url}
          alt={`Referencia: ${campo.etiqueta}`}
          className="mb-2 max-h-56 w-full rounded-md border border-slate-200 object-contain"
        />
      )}
      {campo.tipo === 'enum' && (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={base}
        >
          <option value="">—</option>
          {(campo.opciones ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
      {campo.tipo === 'text' && (
        <input
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={base}
        />
      )}
      {campo.tipo === 'longtext' && (
        <textarea
          rows={2}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={base}
        />
      )}
      {campo.tipo === 'number' && (
        <input
          type="number"
          value={value === null ? '' : (value as number)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className={base}
        />
      )}
      {campo.tipo === 'date' && (
        <input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className={base}
        />
      )}
      {campo.tipo === 'signature' && (
        <SignaturePad
          value={(value as string) ?? null}
          onChange={(v) => onChange(v)}
        />
      )}
    </div>
  )
}

// --- small layout helpers ---
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  )
}

function NavButtons({
  onBack,
  onNext,
}: {
  onBack: () => void
  onNext?: () => void
}) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <button
        onClick={onBack}
        className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
      >
        ← Atrás
      </button>
      {onNext && (
        <button
          onClick={onNext}
          className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Continuar →
        </button>
      )}
    </div>
  )
}

function Steps({ step }: { step: number }) {
  const labels = ['Tipo', 'Productor', 'Parcelas', 'Formulario']
  return (
    <div className="mb-5 flex items-center gap-2">
      {labels.map((l, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        return (
          <div key={l} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                active
                  ? 'bg-orange-500 text-white'
                  : done
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {n}
            </span>
            <span
              className={`text-sm ${active ? 'font-medium text-slate-800' : 'text-slate-400'}`}
            >
              {l}
            </span>
            {n < labels.length && <span className="text-slate-300">→</span>}
          </div>
        )
      })}
    </div>
  )
}
