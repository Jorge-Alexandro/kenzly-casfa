'use client'

// Ficha capture wizard (Modulo 3). Steps:
//   1. Tipo de ficha (robusta / arabe / tropicales)
//   2. Productor (filtered by the ficha's cultivo)
//   3. Parcelas del productor (multi-select + suma de superficie)
//   4. Formulario dinamico (secciones/campos del template)
// Saves via POST /api/fichas.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  FormTemplate,
  ProductorLite,
  ParcelaLite,
  TipoFicha,
  FormCampo,
  CampoColumna,
} from '@/lib/types'
import {
  TIPO_FICHA_LABEL,
  TIPO_FICHA_CULTIVO,
  NIVEL_CERT_LABEL,
  NIVEL_CERT_NOMBRE,
} from '@/lib/types'
import SignaturePad from './SignaturePad'
import EstimacionFichaSection from './EstimacionFichaSection'
import EditarDatosCampo from './EditarDatosCampo'
import FichaAnexos from './FichaAnexos'
import PuntosGpsSection from './PuntosGpsSection'
import { codigoCorto, esSeccionPorParcela } from '@/lib/format'
import { enviarOEncolar, guardarEdicionFicha } from '@/lib/offline/sync'
import { guardarBorrador, leerBorrador, borrarBorrador } from '@/lib/offline/db'

// Las respuestas pueden ser escalares o filas de tabla (variedades, etc.).
type FilaTabla = Record<string, string | number | null>
type Respuestas = Record<string, unknown>

// Ficha existente que se está reabriendo para corregir (#1).
export interface FichaEnEdicion {
  id: string
  tipo: TipoFicha
  template_id: string | null
  productor_id: string
  parcela_ids: string[]
  fecha_inspeccion: string | null
  respuestas: Respuestas
  estado: string
}

export default function FichaWizard({
  templates,
  productores,
  parcelas,
  fichaEdicion,
}: {
  templates: FormTemplate[]
  productores: ProductorLite[]
  parcelas: ParcelaLite[]
  /** Si viene, el wizard edita esa ficha en vez de crear una nueva. */
  fichaEdicion?: FichaEnEdicion
}) {
  const router = useRouter()
  const editando = !!fichaEdicion
  // Estado con el que se abre la pantalla: ficha existente o captura en blanco.
  const [inicial] = useState(() => ({
    tipo: (fichaEdicion?.tipo ?? null) as TipoFicha | null,
    productorId: fichaEdicion?.productor_id ?? null,
    parcelaIds: fichaEdicion?.parcela_ids ?? [],
    respuestas: (fichaEdicion?.respuestas ?? {}) as Respuestas,
    fecha: fichaEdicion?.fecha_inspeccion ?? new Date().toISOString().slice(0, 10),
  }))
  // Al editar se entra directo al formulario: tipo/productor ya están decididos.
  const [step, setStep] = useState(editando ? 4 : 1)
  const [tipo, setTipo] = useState<TipoFicha | null>(inicial.tipo)
  const [productorId, setProductorId] = useState<string | null>(inicial.productorId)
  const [parcelaIds, setParcelaIds] = useState<string[]>(inicial.parcelaIds)
  const [respuestas, setRespuestas] = useState<Respuestas>(inicial.respuestas)
  const [fecha, setFecha] = useState(inicial.fecha)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prodQuery, setProdQuery] = useState('')
  // Resultado del guardado: abre el panel de anexos en vez de salir (#4).
  const [guardada, setGuardada] = useState<
    { fichaId: string | null; online: boolean } | null
  >(null)
  // Autoguardado local (#3).
  const claveBorrador = fichaEdicion ? `ficha:${fichaEdicion.id}` : 'nueva'
  const [autoguardado, setAutoguardado] = useState<number | null>(null)
  const [borradorRecuperado, setBorradorRecuperado] = useState(false)
  const listoParaAutoguardar = useRef(false)
  // Huella del estado con el que se abrió la pantalla: sirve para no escribir
  // (ni anunciar) un borrador cuando en realidad nadie ha tocado nada.
  const huella = (v: {
    tipo: TipoFicha | null
    productorId: string | null
    parcelaIds: string[]
    respuestas: Respuestas
    fecha: string
  }) => JSON.stringify([v.tipo, v.productorId, v.parcelaIds, v.fecha, v.respuestas])
  const huellaInicial = useRef(huella(inicial))

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

  // Parcelas seleccionadas (para mostrar área por parcela y autollenar producción).
  const parcelasSeleccionadas = useMemo(
    () => parcelasProductor.filter((p) => parcelaIds.includes(p.id)),
    [parcelasProductor, parcelaIds],
  )

  // Valores que se "jalan de la BD" (#3): producción/superficie de las parcelas.
  const autofillValores = useMemo(() => {
    const sum = (sel: (p: ParcelaLite) => number | null) =>
      parcelasSeleccionadas.reduce((s, p) => s + (Number(sel(p)) || 0), 0)
    const prod = sum((p) => p.cafe_produccion_qq)
    return {
      produccion_anterior: prod || null,
      produccion_actual: prod || null,
      superficie_cafe: sum((p) => p.cafe_superficie_ha) || null,
    }
  }, [parcelasSeleccionadas])

  // Al cambiar las parcelas, prellenar los campos con autofill desde la BD.
  // Con 2+ parcelas, la sección de la parcela se separa por parcela (claves
  // `campo::parcelaId`) y cada una se autollena con SUS propios datos.
  useEffect(() => {
    if (!template) return
    const multi = parcelasSeleccionadas.length > 1
    setRespuestas((r) => {
      const next = { ...r }
      for (const sec of template.secciones) {
        const porParcela = multi && esSeccionPorParcela(sec.nombre)
        for (const c of sec.campos) {
          const key = c.config?.autofill
          if (!key) continue
          if (porParcela) {
            for (const p of parcelasSeleccionadas) {
              const val = key === 'superficie_cafe' ? p.cafe_superficie_ha : p.cafe_produccion_qq
              next[`${c.nombre_interno}::${p.id}`] = val ?? null
            }
          } else {
            next[c.nombre_interno] = autofillValores[key]
          }
        }
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autofillValores, template, parcelasSeleccionadas])

  const productor = productores.find((p) => p.id === productorId)

  // --- Autoguardado (#3) -----------------------------------------------------
  // La tablet se apaga, se cierra la app, se va la batería a media inspección.
  // Lo capturado vive en el dispositivo desde el primer campo; se borra solo
  // cuando la ficha se guarda de verdad. No depende de la red.
  // Al montar: recuperar lo que quedó a medias.
  useEffect(() => {
    let vivo = true
    leerBorrador(claveBorrador)
      .then((b) => {
        if (!vivo || !b) return
        // Si el borrador es idéntico a lo que ya se abrió (caso típico al
        // reeditar una ficha sin cambiarla), no hay nada que recuperar.
        const h = huella({
          tipo: b.tipo as TipoFicha | null,
          productorId: b.productor_id,
          parcelaIds: b.parcela_ids,
          respuestas: b.respuestas,
          fecha: b.fecha,
        })
        if (h === huellaInicial.current) return
        setTipo((b.tipo as TipoFicha) ?? null)
        setProductorId(b.productor_id)
        setParcelaIds(b.parcela_ids)
        setRespuestas(b.respuestas)
        setFecha(b.fecha)
        setStep(b.step)
        setBorradorRecuperado(true)
      })
      .finally(() => {
        // Solo después de intentar recuperar se habilita el guardado, para no
        // pisar el borrador con el estado vacío del primer render.
        if (vivo) listoParaAutoguardar.current = true
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Al escribir: guardar con un respiro de 1.2 s para no castigar la tablet.
  useEffect(() => {
    if (!listoParaAutoguardar.current) return
    if (!tipo && !productorId && Object.keys(respuestas).length === 0) return
    // Nada que guardar si sigue igual que como se abrió.
    if (huella({ tipo, productorId, parcelaIds, respuestas, fecha }) === huellaInicial.current)
      return
    const t = setTimeout(() => {
      guardarBorrador({
        clave: claveBorrador,
        guardado_en: Date.now(),
        tipo,
        productor_id: productorId,
        parcela_ids: parcelaIds,
        fecha,
        respuestas,
        step,
        etiqueta: `${tipo ? TIPO_FICHA_LABEL[tipo] : 'Ficha'} · ${productor?.nombre_completo ?? 'sin productor'}`,
      })
        .then(() => setAutoguardado(Date.now()))
        .catch(() => {})
    }, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, productorId, parcelaIds, respuestas, fecha, step])

  function setCampo(nombre: string, value: unknown) {
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
      const etiqueta = `${TIPO_FICHA_LABEL[tipo]} · ${productor?.nombre_completo ?? ''}`
      // Offline-aware: si hay red se sube; si no, se guarda en el dispositivo
      // y se sincroniza sola al volver la conexión.
      const r = fichaEdicion
        ? await guardarEdicionFicha(
            fichaEdicion.id,
            { parcela_ids: parcelaIds, fecha_inspeccion: fecha, respuestas, estado },
            `${etiqueta} (corrección)`,
          )
        : await enviarOEncolar(
            {
              tipo,
              template_id: template?.id ?? null,
              productor_id: productorId,
              parcela_ids: parcelaIds,
              fecha_inspeccion: fecha,
              respuestas,
              estado,
            },
            etiqueta,
          )
      // Ya está a salvo (en el servidor o en la cola): el borrador sobra.
      await borrarBorrador(claveBorrador).catch(() => {})
      // No se sale de la ficha: se abre el panel para anexar bitácora e
      // historial de la MISMA inspección, que es como se levanta en campo (#4).
      setGuardada({ fichaId: r.fichaId ?? fichaEdicion?.id ?? null, online: r.online })
      if (r.online) router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setBusy(false)
    }
  }

  // Panel posterior al guardado: anexos + salidas. Se muestra en lugar del
  // formulario para que quede claro que la ficha ya está guardada.
  if (guardada && tipo && productorId) {
    return (
      <FichaAnexos
        online={guardada.online}
        fichaId={guardada.fichaId}
        editada={editando}
        parcelas={parcelasSeleccionadas}
        etiquetaProductor={productor?.nombre_completo ?? ''}
        onSeguirEditando={() => setGuardada(null)}
      />
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {editando ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5">
          <span className="text-sm font-medium text-sky-800">
            Editando una ficha ya guardada
          </span>
          <AvisoAutoguardado en={autoguardado} />
        </div>
      ) : (
        <Steps step={step} />
      )}

      {borradorRecuperado && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span>Recuperamos lo que habías capturado en este dispositivo.</span>
          <button
            onClick={async () => {
              await borrarBorrador(claveBorrador).catch(() => {})
              location.reload()
            }}
            className="rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium hover:bg-amber-100"
          >
            Descartar y empezar de cero
          </button>
        </div>
      )}

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

          <div className="mt-3 text-sm text-slate-500">
            {parcelaIds.length} parcela(s) seleccionada(s) — el área se registra
            por parcela (no se suma).
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
          {/* Estatus del productor arriba de todo (CHESPAL) */}
          {productor && (
            <ProductorBanner
              productor={productor}
              parcelas={parcelasSeleccionadas}
            />
          )}
          <Card title="Datos de la inspección">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Fecha de inspección">
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </Field>
              <Field label="Hora de inicio">
                <input
                  type="time"
                  value={(respuestas.hora_inicio as string) ?? ''}
                  onChange={(e) => setCampo('hora_inicio', e.target.value || null)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </Field>
              <Field label="Hora de término">
                <input
                  type="time"
                  value={(respuestas.hora_fin as string) ?? ''}
                  onChange={(e) => setCampo('hora_fin', e.target.value || null)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </Field>
            </div>
          </Card>

          {/* Levantamiento del polígono caminando el predio. Va arriba porque
              el recorrido se hace al llegar, antes de sentarse a contestar. */}
          <Card title="Levantamiento del polígono (GPS)">
            <PuntosGpsSection
              parcelas={parcelasSeleccionadas}
              respuestas={respuestas}
              onPuntos={(clave, puntos) => setCampo(clave, puntos)}
            />
          </Card>

          {template.secciones.map((sec) => {
            // Con una sola parcela nada se repite: las claves quedan planas.
            const varias = parcelasSeleccionadas.length > 1
            // La sección entera describe la parcela (variedades, producción…).
            const seccionEntera = varias && esSeccionPorParcela(sec.nombre)
            // Dentro de una sección mixta, los campos marcados `por_parcela`
            // (colindancias, amortiguamiento) también se preguntan uno por
            // predio: cada parcela colinda con cosas distintas.
            const globales = seccionEntera
              ? []
              : sec.campos.filter((c) => !(varias && c.config?.por_parcela))
            const deParcela = seccionEntera
              ? sec.campos
              : varias
                ? sec.campos.filter((c) => c.config?.por_parcela)
                : []

            return (
              <Card key={sec.id} title={sec.nombre}>
                {sec.nombre === 'Estimación de cosecha' ? (
                  <EstimacionFichaSection
                    tipo={tipo}
                    value={respuestas}
                    onResult={(partial) => setRespuestas((r) => ({ ...r, ...partial }))}
                  />
                ) : (
                  <div className="space-y-4">
                    {/* Campos del productor / de la ficha completa */}
                    {globales
                      // #6 Visibilidad condicional: ocultar si no se cumple.
                      .filter((campo) => {
                        const c = campo.config?.condicion
                        return !c || respuestas[c.campo] === c.igual
                      })
                      .map((campo) => (
                        <DynamicField
                          key={campo.id}
                          campo={campo}
                          value={respuestas[campo.nombre_interno] ?? null}
                          onChange={(v) => setCampo(campo.nombre_interno, v)}
                        />
                      ))}

                    {/* Una sub-tarjeta por parcela */}
                    {deParcela.length > 0 &&
                      parcelasSeleccionadas.map((parcela) => {
                        const visibles = deParcela.filter((campo) => {
                          const c = campo.config?.condicion
                          return (
                            !c ||
                            respuestas[`${c.campo}::${parcela.id}`] === c.igual ||
                            respuestas[c.campo] === c.igual
                          )
                        })
                        if (visibles.length === 0) return null
                        return (
                          <div
                            key={parcela.id}
                            className="rounded-lg border border-orange-100 bg-orange-50/40 p-3"
                          >
                            <p className="mb-3 text-sm font-semibold text-orange-800">
                              Parcela: {codigoCorto(parcela.codigo_parcela, parcela.nombre)}
                              {parcela.nombre ? ` — ${parcela.nombre}` : ''}
                            </p>
                            <div className="space-y-4">
                              {visibles.map((campo) => {
                                const k = `${campo.nombre_interno}::${parcela.id}`
                                return (
                                  <DynamicField
                                    key={campo.id}
                                    campo={campo}
                                    value={respuestas[k] ?? null}
                                    onChange={(v) => setCampo(k, v)}
                                  />
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </Card>
            )
          })}

          {error && (
            <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {editando ? (
              <AvisoAutoguardado en={autoguardado} />
            ) : (
              <button
                onClick={() => setStep(3)}
                className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                ← Atrás
              </button>
            )}
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
                {busy ? 'Guardando…' : editando ? 'Guardar cambios' : 'Enviar a revisión'}
              </button>
            </div>
          </div>
          {!editando && (
            <div className="mt-3 flex justify-end">
              <AvisoAutoguardado en={autoguardado} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Marca de agua del autoguardado: el inspector necesita ver que lo suyo ya
// está a salvo en la tablet, aunque no haya señal para subirlo.
function AvisoAutoguardado({ en }: { en: number | null }) {
  if (!en) return <span className="text-xs text-slate-400">Autoguardado activo</span>
  const hora = new Date(en).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <span className="text-xs text-green-700">
      ✓ Guardado en este dispositivo · {hora}
    </span>
  )
}

// --- field renderer ---
function DynamicField({
  campo,
  value,
  onChange,
}: {
  campo: FormCampo
  value: unknown
  onChange: (v: unknown) => void
}) {
  const short =
    campo.tipo === 'enum' || campo.tipo === 'number' || campo.tipo === 'date' || campo.tipo === 'time'
  const base = `${short ? 'w-full max-w-xs' : 'w-full'} rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400`
  const str = (value as string) ?? ''
  const esAutofill = !!campo.config?.autofill

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {campo.etiqueta}
        {esAutofill && <span className="ml-1 text-xs font-normal text-slate-400">(de la BD)</span>}
      </label>
      {campo.imagen_referencia_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={campo.imagen_referencia_url}
          alt={`Referencia: ${campo.etiqueta}`}
          className="mb-2 max-h-56 w-full rounded-md border border-slate-200 object-contain"
        />
      )}

      {campo.tipo === 'tabla' && (
        <TablaField
          columnas={campo.config?.columnas ?? []}
          value={Array.isArray(value) ? (value as FilaTabla[]) : []}
          onChange={onChange}
        />
      )}

      {campo.tipo === 'enum' &&
        (campo.config?.multiple ? (
          <MultiEnum
            opciones={campo.opciones ?? []}
            value={Array.isArray(value) ? (value as string[]) : []}
            onChange={onChange}
            opcionOtro={!!campo.config?.opcion_otro}
          />
        ) : campo.config?.opcion_otro ? (
          <EnumOtro opciones={campo.opciones ?? []} value={str} onChange={onChange} cls={base} />
        ) : (
          <select value={str} onChange={(e) => onChange(e.target.value || null)} className={base}>
            <option value="">—</option>
            {(campo.opciones ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ))}

      {campo.tipo === 'text' && (
        <input value={str} onChange={(e) => onChange(e.target.value || null)} className={base} />
      )}
      {campo.tipo === 'longtext' && (
        <textarea rows={2} value={str} onChange={(e) => onChange(e.target.value || null)} className={base} />
      )}
      {campo.tipo === 'number' && (
        <>
          <input
            type="number"
            value={value === null || value === undefined ? '' : (value as number)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            className={base}
          />
          {campo.config?.convertidor && (
            <Convertidor salida={campo.config.convertidor} onUsar={onChange} />
          )}
        </>
      )}
      {campo.tipo === 'date' && (
        <input type="date" value={str} onChange={(e) => onChange(e.target.value || null)} className={base} />
      )}
      {campo.tipo === 'time' && (
        <input type="time" value={str} onChange={(e) => onChange(e.target.value || null)} className={base} />
      )}
      {campo.tipo === 'signature' && (
        <SignaturePad value={str || null} onChange={(v) => onChange(v)} />
      )}
    </div>
  )
}

// Convertidor de producción (CHESPAL): el productor dicta "10 quintales" o
// "1 tonelada"; la app calcula el total en la unidad de la ficha y lo pone en
// el campo con "Usar". 1 quintal = 57.5 kg · 1 tonelada = 1000 kg.
const KG_POR_QUINTAL = 57.5
function Convertidor({
  salida,
  onUsar,
}: {
  salida: 'kg' | 'qq'
  onUsar: (v: number) => void
}) {
  const [cantidad, setCantidad] = useState('')
  const [unidad, setUnidad] = useState<'qq' | 't' | 'kg'>('qq')

  const n = Number(cantidad)
  const kg = !Number.isFinite(n) || n <= 0 ? null : unidad === 'qq' ? n * KG_POR_QUINTAL : unidad === 't' ? n * 1000 : n
  const resultado = kg === null ? null : salida === 'kg' ? kg : kg / KG_POR_QUINTAL

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
      <span className="font-medium">El productor dijo:</span>
      <input
        type="number"
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
        placeholder="10"
        className="w-16 rounded border border-slate-200 px-1.5 py-1 outline-none focus:border-orange-400"
      />
      <select
        value={unidad}
        onChange={(e) => setUnidad(e.target.value as typeof unidad)}
        className="rounded border border-slate-200 px-1.5 py-1 outline-none focus:border-orange-400"
      >
        <option value="qq">quintales (57.5 kg)</option>
        <option value="t">toneladas</option>
        <option value="kg">kilogramos</option>
      </select>
      {resultado !== null && (
        <>
          <span className="tabular-nums">
            = <strong>{resultado.toFixed(2)} {salida === 'kg' ? 'kg' : 'qq'}</strong>
          </span>
          <button
            type="button"
            onClick={() => onUsar(Number(resultado.toFixed(2)))}
            className="rounded bg-orange-500 px-2 py-1 font-medium text-white hover:bg-orange-600"
          >
            Usar
          </button>
        </>
      )}
    </div>
  )
}

// Enum con opción "Otro": al elegir "Otro" se muestra un texto libre y el valor
// guardado es "Otro: <texto>".
function EnumOtro({
  opciones,
  value,
  onChange,
  cls,
}: {
  opciones: string[]
  value: string
  onChange: (v: unknown) => void
  cls: string
}) {
  const esOtro = value.startsWith('Otro')
  const otroTexto = esOtro ? value.replace(/^Otro:?\s*/, '') : ''
  return (
    <div className="space-y-2">
      <select
        value={esOtro ? 'Otro' : value}
        onChange={(e) => onChange(e.target.value === 'Otro' ? 'Otro: ' : e.target.value || null)}
        className={cls}
      >
        <option value="">—</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {esOtro && (
        <input
          value={otroTexto}
          placeholder="Especifica…"
          onChange={(e) => onChange('Otro: ' + e.target.value)}
          className="w-full max-w-xs rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400"
        />
      )}
    </div>
  )
}

// Enum de selección múltiple (checkboxes). El valor es un arreglo de opciones;
// si opcionOtro, la entrada "Otro" admite texto libre ("Otro: <texto>").
function MultiEnum({
  opciones,
  value,
  onChange,
  opcionOtro,
}: {
  opciones: string[]
  value: string[]
  onChange: (v: unknown) => void
  opcionOtro: boolean
}) {
  const arr = value
  const otroEntry = arr.find((v) => v.startsWith('Otro'))
  const otroChecked = !!otroEntry

  function toggle(op: string) {
    if (op === 'Otro') {
      onChange(otroChecked ? arr.filter((v) => !v.startsWith('Otro')) : [...arr, 'Otro: '])
    } else {
      onChange(arr.includes(op) ? arr.filter((v) => v !== op) : [...arr, op])
    }
  }

  return (
    <div className="space-y-1">
      {opciones.map((op) => (
        <label key={op} className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={op === 'Otro' ? otroChecked : arr.includes(op)}
            onChange={() => toggle(op)}
            className="h-4 w-4 accent-orange-500"
          />
          {op}
        </label>
      ))}
      {opcionOtro && otroChecked && (
        <input
          value={(otroEntry ?? '').replace(/^Otro:?\s*/, '')}
          placeholder="Especifica…"
          onChange={(e) =>
            onChange([...arr.filter((v) => !v.startsWith('Otro')), 'Otro: ' + e.target.value])
          }
          className="w-full max-w-xs rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400"
        />
      )}
    </div>
  )
}

// Campo tipo tabla: filas repetibles con columnas (text/number/calc).
function TablaField({
  columnas,
  value,
  onChange,
}: {
  columnas: CampoColumna[]
  value: FilaTabla[]
  onChange: (v: unknown) => void
}) {
  const filas = value.length > 0 ? value : [{}]

  function setCelda(i: number, colId: string, v: string | number | null) {
    const next = filas.map((f, idx) => (idx === i ? { ...f, [colId]: v } : f))
    onChange(recalcular(next, columnas))
  }
  function agregar() {
    onChange([...filas, {}])
  }
  function quitar(i: number) {
    const next = filas.filter((_, idx) => idx !== i)
    onChange(next.length > 0 ? next : [{}])
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            {columnas.map((c) => (
              <th key={c.id} className="p-1.5 font-medium">
                {c.label}
              </th>
            ))}
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i} className="border-t border-slate-100">
              {columnas.map((c) => (
                <td key={c.id} className="p-1">
                  {c.tipo === 'calc' ? (
                    <span className="px-1 tabular-nums text-slate-700">
                      {fila[c.id] !== undefined && fila[c.id] !== null
                        ? Number(fila[c.id]).toFixed(2)
                        : '—'}
                    </span>
                  ) : (
                    <input
                      type={c.tipo === 'number' ? 'number' : 'text'}
                      value={(fila[c.id] as string | number) ?? ''}
                      onChange={(e) =>
                        setCelda(
                          i,
                          c.id,
                          c.tipo === 'number'
                            ? e.target.value === ''
                              ? null
                              : Number(e.target.value)
                            : e.target.value || null,
                        )
                      }
                      className="w-full min-w-[80px] rounded border border-slate-200 px-1.5 py-1 outline-none focus:border-orange-400"
                    />
                  )}
                </td>
              ))}
              <td className="p-1 text-center">
                <button
                  type="button"
                  onClick={() => quitar(i)}
                  className="text-slate-400 hover:text-red-600"
                  title="Quitar fila"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={agregar}
        className="m-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        + Agregar fila
      </button>
    </div>
  )
}

// Recalcula columnas 'calc' (p.ej. densidad = 10000/(marco_a*marco_b)).
function recalcular(filas: FilaTabla[], columnas: CampoColumna[]): FilaTabla[] {
  const calc = columnas.filter((c) => c.tipo === 'calc')
  if (calc.length === 0) return filas
  return filas.map((fila) => {
    const out = { ...fila }
    for (const c of calc) {
      out[c.id] = evalFormula(c.formula ?? '', fila)
    }
    return out
  })
}

// Evalúa una fórmula simple con ids de columnas (sin eval(): parser acotado).
function evalFormula(formula: string, fila: FilaTabla): number | null {
  if (!formula) return null
  // Sustituye ids por valores numéricos.
  const expr = formula.replace(/[a-z_][a-z0-9_]*/gi, (id) => {
    const v = Number(fila[id])
    return Number.isFinite(v) ? String(v) : 'NaN'
  })
  // Solo permitimos dígitos, operadores y paréntesis.
  if (!/^[0-9+\-*/().\sNaN]+$/.test(expr)) return null
  try {
    // eslint-disable-next-line no-new-func
    const r = Function(`"use strict";return (${expr})`)()
    return Number.isFinite(r) ? Number(r) : null
  } catch {
    return null
  }
}

// --- small layout helpers ---
// Banner con el estatus del productor arriba de la ficha (CHESPAL): nombre,
// código, comunidad y NIVEL de certificación vigente (O / T3 / T2 / T1 / Nuevo).
function ProductorBanner({
  productor,
  parcelas,
}: {
  productor: ProductorLite
  parcelas: ParcelaLite[]
}) {
  const nivel = productor.estatus_nivel
  const colores: Record<string, string> = {
    organico: 'bg-green-100 text-green-800 ring-green-200',
    t3: 'bg-lime-100 text-lime-800 ring-lime-200',
    t2: 'bg-amber-100 text-amber-800 ring-amber-200',
    t1: 'bg-orange-100 text-orange-800 ring-orange-200',
    nuevo: 'bg-slate-100 text-slate-700 ring-slate-200',
  }
  return (
    <section className="mb-4 rounded-xl border border-orange-200 bg-orange-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-800">
            {productor.nombre_completo}
          </p>
          <p className="text-xs text-slate-500">
            {productor.codigo}
            {(productor.comunidad || productor.municipio) &&
              ` · ${[productor.comunidad, productor.municipio].filter(Boolean).join(', ')}`}
          </p>
        </div>
        <div className="text-right">
          <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Estatus de certificación {productor.estatus_anio ? `(${productor.estatus_anio})` : new Date().getFullYear()}
          </span>
          <NivelSelector
            productorId={productor.id}
            nivelInicial={nivel}
            colores={colores}
          />
        </div>
      </div>
      {parcelas.length > 0 && (
        <p className="mt-2 border-t border-orange-200/70 pt-2 text-xs text-slate-500">
          Parcela(s): {parcelas.map((p) => codigoCorto(p.codigo_parcela, p.nombre)).join(' · ')}
        </p>
      )}
      {productor.plantas_entregadas.length > 0 && (
        <div className="mt-2 border-t border-orange-200/70 pt-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Plantas entregadas en Agroecología (verificar en campo)
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {productor.plantas_entregadas.map((e, i) => (
              <span
                key={i}
                className="rounded-md bg-green-50 px-2 py-0.5 text-xs text-green-800 ring-1 ring-green-200"
              >
                {e.cantidad} {e.especie} <span className="text-green-600">({e.anio})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* #F Corregir datos del productor/parcela en campo (offline) */}
      <EditarDatosCampo productor={productor} parcelas={parcelas} />
    </section>
  )
}

// #2 Cambiar el nivel de certificación (O/T1/T2/T3/Nuevo) del productor para el
// año actual, desde la propia ficha. Guarda vía /api/certificacion/estatus.
function NivelSelector({
  productorId,
  nivelInicial,
  colores,
}: {
  productorId: string
  nivelInicial: string | null
  colores: Record<string, string>
}) {
  const NIVELES = ['nuevo', 't1', 't2', 't3', 'organico'] as const
  const [nivel, setNivel] = useState<string>(nivelInicial ?? '')
  const [msg, setMsg] = useState<'guardando' | 'ok' | 'error' | null>(null)

  async function cambiar(nuevo: string) {
    setNivel(nuevo)
    if (!nuevo) return
    setMsg('guardando')
    try {
      const res = await fetch('/api/certificacion/estatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productor_id: productorId, anio: new Date().getFullYear(), nivel: nuevo }),
      })
      setMsg(res.ok ? 'ok' : 'error')
    } catch {
      setMsg('error')
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <select
        value={nivel}
        onChange={(e) => cambiar(e.target.value)}
        className={`cursor-pointer rounded-full px-2.5 py-1 text-sm font-bold outline-none ring-1 ${nivel ? (colores[nivel] ?? colores.nuevo) : 'bg-white text-slate-400 ring-slate-200'}`}
      >
        <option value="">Sin estatus</option>
        {NIVELES.map((n) => (
          <option key={n} value={n}>{NIVEL_CERT_LABEL[n]} — {NIVEL_CERT_NOMBRE[n]}</option>
        ))}
      </select>
      {msg === 'guardando' && <span className="text-[10px] text-slate-400">…</span>}
      {msg === 'ok' && <span className="text-[10px] text-green-600">✓</span>}
      {msg === 'error' && <span className="text-[10px] text-red-600">error</span>}
    </div>
  )
}

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
