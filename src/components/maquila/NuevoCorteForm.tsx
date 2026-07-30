'use client'

// Formulario de captura nativa de un corte de maquila (Fase 1).
//
// Flujo: 1) elegir QUÉ café se procesa (de eso salen las boletas candidatas),
// 2) marcar las boletas que entraron —con su saldo, una boleta grande puede
// repartirse entre dos cortes—, 3) teclear sacos/kilos de cada producto de
// salida, 4) el cuadre de sacos (arrastre, lotes, torrefacción…) con el "no
// enviados" ya calculado, 5) firmas.
//
// Los avisos se recalculan en vivo con la MISMA lógica que usará el servidor
// (lib/maquila/captura.ts) — lo que se ve aquí es lo que va a pasar al guardar.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import SignaturePad from '@/components/fichas/SignaturePad'
import type { CatalogoProducto, SiguienteCorte } from '@/lib/data/maquila'
import {
  totalKgResultado, sumaBoletas, calcularNoEnviados, validarCorteNativo, validarSaldoBoletas,
  KG_POR_SACO, type BoletaDisponible, type BoletaUso, type ResultadoInput, type Cuadre,
} from '@/lib/maquila/captura'

const hoy = () => new Date().toISOString().slice(0, 10)
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const numFmt = (n: number, d = 1) => n.toLocaleString('es-MX', { maximumFractionDigits: d })
const pctFmt = (n: number) => `${(n * 100).toFixed(2)}%`

interface UsoState {
  sacos: string
  kg: string
}
interface ResultadoState {
  sacos: string
  kilos_sueltos: string
  kg_por_saco: string
}
interface LoteState {
  numero_lote: string
  sacos: string
  kg: string
  descripcion: string
}
interface FirmasState {
  elaboro: string | null
  entrego: string | null
  retrillero: string | null
  calador: string | null
}

const GRUPO_LABEL: Record<string, string> = {
  primeras: 'Primeras',
  segundas: 'Segundas',
  terceras: 'Terceras',
  merma: 'Merma',
}

export default function NuevoCorteForm({
  disponibles,
  catalogo,
  siguiente,
}: {
  disponibles: BoletaDisponible[]
  catalogo: CatalogoProducto[]
  siguiente: SiguienteCorte
}) {
  const router = useRouter()

  const [fecha, setFecha] = useState(hoy())
  const [tipoProceso, setTipoProceso] = useState<'maquila' | 'repaso_oro' | 'repaso_clasificadora'>('maquila')
  const [numero, setNumero] = useState(String(siguiente.numero))
  const esRepasoClasificadora = tipoProceso === 'repaso_clasificadora'

  // Combos especie|tipo presentes en las boletas disponibles.
  const combos = useMemo(() => {
    const m = new Map<string, { especie: string; tipo: string; boletas: number; kg: number }>()
    for (const b of disponibles) {
      const k = `${b.especie}|${b.tipo}`
      const c = m.get(k) ?? { especie: b.especie, tipo: b.tipo, boletas: 0, kg: 0 }
      c.boletas++
      c.kg += b.kg_disponibles
      m.set(k, c)
    }
    return Array.from(m.entries()).sort((a, b) => b[1].kg - a[1].kg)
  }, [disponibles])

  const [comboElegido, setComboElegido] = useState<string>('')
  const [busqueda, setBusqueda] = useState('')
  const [usos, setUsos] = useState<Record<string, UsoState>>({})

  const candidatas = useMemo(() => {
    const q = norm(busqueda)
    return disponibles.filter((b) => {
      if (comboElegido && `${b.especie}|${b.tipo}` !== comboElegido) return false
      if (q && !norm(`${b.folio} ${b.proveedor_nombre}`).includes(q)) return false
      return true
    })
  }, [disponibles, comboElegido, busqueda])

  const disponiblePorId = useMemo(() => new Map(disponibles.map((d) => [d.id, d])), [disponibles])

  function toggleBoleta(b: BoletaDisponible) {
    setUsos((u) => {
      const n = { ...u }
      if (n[b.id]) {
        delete n[b.id]
      } else {
        n[b.id] = { sacos: String(b.sacos_disponibles), kg: String(b.kg_disponibles) }
      }
      return n
    })
  }
  function usarTodo(b: BoletaDisponible) {
    setUsos((u) => ({ ...u, [b.id]: { sacos: String(b.sacos_disponibles), kg: String(b.kg_disponibles) } }))
  }

  const boletasSeleccionadas: BoletaUso[] = useMemo(
    () =>
      Object.entries(usos).map(([id, v]) => {
        const d = disponiblePorId.get(id)
        return {
          entrada_id: id,
          folio: d?.folio ?? 0,
          especie: d?.especie ?? '',
          tipo: d?.tipo ?? '',
          proveedor_nombre: d?.proveedor_nombre ?? '',
          sacos: Number(v.sacos) || 0,
          kg_netos: Number(v.kg) || 0,
          kg_brutos: Number(v.kg) || 0,
          tara_kg: 0,
        }
      }),
    [usos, disponiblePorId],
  )
  const totalEntrada = useMemo(() => sumaBoletas(boletasSeleccionadas), [boletasSeleccionadas])

  // --- Resultado (productos de salida) --------------------------------------
  const [resultados, setResultados] = useState<Record<string, ResultadoState>>({})

  function setResultado(productoId: string, campo: keyof ResultadoState, valor: string) {
    setResultados((r) => ({
      ...r,
      [productoId]: {
        sacos: r[productoId]?.sacos ?? '0',
        kilos_sueltos: r[productoId]?.kilos_sueltos ?? '0',
        kg_por_saco: r[productoId]?.kg_por_saco ?? String(KG_POR_SACO),
        [campo]: valor,
      },
    }))
  }

  const resultadosValidos: ResultadoInput[] = useMemo(() => {
    const out: ResultadoInput[] = []
    for (const p of catalogo) {
      const r = resultados[p.id]
      if (!r) continue
      const sacos = Number(r.sacos) || 0
      const kilosSueltos = Number(r.kilos_sueltos) || 0
      if (sacos === 0 && kilosSueltos === 0) continue
      out.push({
        producto_id: p.id, clave: p.clave, etiqueta: p.nombre,
        sacos, kilos_sueltos: kilosSueltos, kg_por_saco: Number(r.kg_por_saco) || 69,
      })
    }
    return out
  }, [resultados, catalogo])

  const kgSalida = useMemo(
    () => resultadosValidos.reduce((s, r) => s + totalKgResultado(r), 0),
    [resultadosValidos],
  )
  const rendimiento = totalEntrada.kg > 0 ? kgSalida / totalEntrada.kg : null

  // --- Cuadre de sacos -------------------------------------------------------
  const [cuadreState, setCuadreState] = useState({
    sacos_enviados_lotes: '0',
    sacos_maquilas_previas: String(siguiente.arrastreSugerido),
    sacos_torrefaccion: '0',
    sacos_venta: '0',
    sacos_otro_lote: '0',
    sacos_repaso: '0',
  })
  const cuadre: Cuadre = useMemo(
    () => ({
      sacos_enviados_lotes: Number(cuadreState.sacos_enviados_lotes) || 0,
      sacos_maquilas_previas: Number(cuadreState.sacos_maquilas_previas) || 0,
      sacos_torrefaccion: Number(cuadreState.sacos_torrefaccion) || 0,
      sacos_venta: Number(cuadreState.sacos_venta) || 0,
      sacos_otro_lote: Number(cuadreState.sacos_otro_lote) || 0,
      sacos_repaso: Number(cuadreState.sacos_repaso) || 0,
    }),
    [cuadreState],
  )
  const oroSacos = resultadosValidos.find((r) => r.clave === 'ORO_EXPORTACION')?.sacos ?? 0
  const sacosNoEnviados = calcularNoEnviados(oroSacos, cuadre)

  // --- Lotes de embarque (opcional) ------------------------------------------
  const [lotes, setLotes] = useState<LoteState[]>([])
  const agregarLote = () => setLotes((l) => [...l, { numero_lote: '', sacos: '', kg: '', descripcion: '' }])
  const quitarLote = (i: number) => setLotes((l) => l.filter((_, idx) => idx !== i))
  const editarLote = (i: number, campo: keyof LoteState, valor: string) =>
    setLotes((l) => l.map((x, idx) => (idx === i ? { ...x, [campo]: valor } : x)))

  // --- Personas y firmas -------------------------------------------------------
  const [nombres, setNombres] = useState({ elaboro: '', entrego: '', retrillero: '', calador: '' })
  const [firmas, setFirmas] = useState<FirmasState>({ elaboro: null, entrego: null, retrillero: null, calador: null })
  const [observaciones, setObservaciones] = useState('')

  // --- Avisos en vivo: misma lógica que corre el servidor --------------------
  const avisos = useMemo(() => {
    const lotesValidos = lotes
      .filter((l) => Number(l.numero_lote) > 0)
      .map((l) => ({
        numero_lote: Number(l.numero_lote), sacos: Number(l.sacos) || 0,
        kg: Number(l.kg) || 0, descripcion: l.descripcion || null,
      }))
    const base = validarCorteNativo({
      fechaCorte: fecha || null, tipoProceso, boletas: boletasSeleccionadas,
      resultados: resultadosValidos, lotes: lotesValidos, cuadre,
    })
    const saldo = validarSaldoBoletas(boletasSeleccionadas, disponiblePorId)
    return [...base, ...saldo]
  }, [fecha, tipoProceso, boletasSeleccionadas, resultadosValidos, lotes, cuadre, disponiblePorId])
  const errores = avisos.filter((a) => a.nivel === 'error')
  const revisar = avisos.filter((a) => a.nivel === 'aviso')

  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null)

  async function guardar() {
    setErrorGuardar(null)
    if (errores.length > 0) return setErrorGuardar('Corrige lo marcado en rojo antes de guardar.')
    if (!esRepasoClasificadora && !(Number(numero) > 0)) return setErrorGuardar('Falta el número de corte.')
    setGuardando(true)
    try {
      const res = await fetch('/api/maquila/cortes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_corte: fecha,
          tipo_proceso: tipoProceso,
          numero: esRepasoClasificadora ? null : Number(numero),
          usos: boletasSeleccionadas.map((u) => ({ entrada_id: u.entrada_id, sacos: u.sacos, kg_netos: u.kg_netos })),
          resultados: resultadosValidos,
          lotes: lotes
            .filter((l) => Number(l.numero_lote) > 0)
            .map((l) => ({
              numero_lote: Number(l.numero_lote), sacos: Number(l.sacos) || 0,
              kg: Number(l.kg) || 0, descripcion: l.descripcion || null,
            })),
          cuadre,
          observaciones,
          nombres,
          firmas,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar el corte')
      router.push('/acopio/maquila')
      router.refresh()
    } catch (e) {
      setErrorGuardar(e instanceof Error ? e.message : 'Error al guardar')
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4 pb-10">
      {/* 1. Datos del corte */}
      <Seccion titulo="1 · Datos del corte">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Fecha de corte">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={INPUT} />
          </Campo>
          <Campo label="Tipo de proceso">
            <select
              value={tipoProceso}
              onChange={(e) => setTipoProceso(e.target.value as typeof tipoProceso)}
              className={INPUT}
            >
              <option value="maquila">Maquila (corte normal)</option>
              <option value="repaso_oro">Repaso de oro</option>
              <option value="repaso_clasificadora">Repaso de clasificadora</option>
            </select>
          </Campo>
          {!esRepasoClasificadora && (
            <Campo label="Número de corte">
              <input
                type="number" min="1" value={numero}
                onChange={(e) => setNumero(e.target.value)}
                className={INPUT}
              />
              <span className="mt-0.5 block text-xs text-slate-400">Clave: M-{numero || '…'}</span>
            </Campo>
          )}
        </div>
      </Seccion>

      {/* 2. Boletas */}
      {!esRepasoClasificadora && (
        <Seccion titulo="2 · Boletas que entraron al beneficio">
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setComboElegido('')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${comboElegido === '' ? 'bg-orange-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
            >
              Todos
            </button>
            {combos.map(([k, c]) => (
              <button
                key={k}
                type="button"
                onClick={() => setComboElegido(k)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${comboElegido === k ? 'bg-orange-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
              >
                {c.especie} {c.tipo} · {c.boletas} · {numFmt(c.kg, 0)} kg
              </button>
            ))}
          </div>

          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por folio o proveedor…"
            className={`${INPUT} mb-2`}
          />

          <div className="max-h-80 overflow-y-auto rounded-md border border-slate-200">
            {candidatas.map((b) => {
              const sel = usos[b.id]
              return (
                <div key={b.id} className={`border-b border-slate-100 px-3 py-2 last:border-0 ${sel ? 'bg-orange-50/50' : ''}`}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={!!sel} onChange={() => toggleBoleta(b)} className="h-4 w-4" />
                    <button type="button" onClick={() => toggleBoleta(b)} className="min-w-0 flex-1 text-left">
                      <span className="font-medium text-slate-800">B{b.folio}</span>{' '}
                      <span className="text-slate-600">{b.proveedor_nombre}</span>{' '}
                      <span className="text-slate-400">· {b.especie} {b.tipo}</span>
                    </button>
                    <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                      disp. {b.sacos_disponibles} sc · {numFmt(b.kg_disponibles)} kg
                    </span>
                  </div>
                  {sel && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-6">
                      <label className="text-xs text-slate-500">
                        Sacos a usar{' '}
                        <input
                          type="number" min="0" max={b.sacos_disponibles} step="1"
                          value={sel.sacos}
                          onChange={(e) => setUsos((u) => ({ ...u, [b.id]: { ...u[b.id], sacos: e.target.value } }))}
                          className="ml-1 w-20 rounded border border-slate-300 px-1.5 py-0.5 text-right"
                        />
                      </label>
                      <label className="text-xs text-slate-500">
                        Kg a usar{' '}
                        <input
                          type="number" min="0" max={b.kg_disponibles} step="0.1"
                          value={sel.kg}
                          onChange={(e) => setUsos((u) => ({ ...u, [b.id]: { ...u[b.id], kg: e.target.value } }))}
                          className="ml-1 w-24 rounded border border-slate-300 px-1.5 py-0.5 text-right"
                        />
                      </label>
                      {(Number(sel.sacos) !== b.sacos_disponibles || Number(sel.kg) !== b.kg_disponibles) && (
                        <button type="button" onClick={() => usarTodo(b)} className="text-xs text-orange-700 hover:underline">
                          Usar todo lo disponible
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {candidatas.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-slate-400">Ninguna boleta con ese filtro.</p>
            )}
          </div>

          <div className="mt-2 flex gap-4 text-sm text-slate-600">
            <span><strong>{boletasSeleccionadas.length}</strong> boletas seleccionadas</span>
            <span><strong>{totalEntrada.sacos}</strong> sacos</span>
            <span><strong>{numFmt(totalEntrada.kg)}</strong> kg de entrada</span>
          </div>
        </Seccion>
      )}

      {/* 3. Resultado */}
      <Seccion titulo={`${esRepasoClasificadora ? '2' : '3'} · Resultado (lo que salió del beneficio)`}>
        {(['primeras', 'segundas', 'terceras', 'merma'] as const).map((grupo) => {
          const productos = catalogo.filter((p) => p.grupo === grupo)
          if (productos.length === 0) return null
          return (
            <div key={grupo} className="mb-3">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{GRUPO_LABEL[grupo]}</h4>
              <div className="space-y-1.5">
                {productos.map((p) => {
                  const r = resultados[p.id]
                  const total = r ? totalKgResultado({
                    sacos: Number(r.sacos) || 0, kilos_sueltos: Number(r.kilos_sueltos) || 0,
                    kg_por_saco: Number(r.kg_por_saco) || 69,
                  }) : 0
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 px-2.5 py-1.5">
                      <span className="w-44 shrink-0 text-sm text-slate-700">{p.nombre}</span>
                      <label className="text-xs text-slate-500">
                        Sacos{' '}
                        <input type="number" min="0" step="1" value={r?.sacos ?? ''} placeholder="0"
                          onChange={(e) => setResultado(p.id, 'sacos', e.target.value)}
                          className="ml-1 w-16 rounded border border-slate-300 px-1.5 py-0.5 text-right" />
                      </label>
                      <label className="text-xs text-slate-500">
                        × kg/saco{' '}
                        <input type="number" min="0" step="0.1" value={r?.kg_por_saco ?? String(p.kg_por_saco)}
                          onChange={(e) => setResultado(p.id, 'kg_por_saco', e.target.value)}
                          className="ml-1 w-16 rounded border border-slate-300 px-1.5 py-0.5 text-right" />
                      </label>
                      <label className="text-xs text-slate-500">
                        + kilos sueltos{' '}
                        <input type="number" min="0" step="0.1" value={r?.kilos_sueltos ?? ''} placeholder="0"
                          onChange={(e) => setResultado(p.id, 'kilos_sueltos', e.target.value)}
                          className="ml-1 w-20 rounded border border-slate-300 px-1.5 py-0.5 text-right" />
                      </label>
                      <span className="ml-auto text-sm font-medium tabular-nums text-slate-700">
                        {total > 0 ? `${numFmt(total)} kg` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        <div className="mt-2 flex flex-wrap gap-4 rounded-md bg-slate-50 px-3 py-2 text-sm">
          <span>Kg de salida: <strong className="tabular-nums">{numFmt(kgSalida)}</strong></span>
          {rendimiento != null && (
            <span>Rendimiento: <strong className="tabular-nums">{pctFmt(rendimiento)}</strong></span>
          )}
        </div>
      </Seccion>

      {/* 4. Cuadre de sacos (sólo si hay Oro Exportación en el resultado) */}
      {!esRepasoClasificadora && (
        <Seccion titulo={`${esRepasoClasificadora ? '3' : '4'} · Cuadre de sacos de Oro Exportación`}>
          <div className="grid gap-3 sm:grid-cols-3">
            <CampoCuadre label="Arrastre de cortes anteriores" value={cuadreState.sacos_maquilas_previas}
              onChange={(v) => setCuadreState((c) => ({ ...c, sacos_maquilas_previas: v }))}
              nota="sugerido del corte anterior" />
            <CampoCuadre label="Enviados en lotes" value={cuadreState.sacos_enviados_lotes}
              onChange={(v) => setCuadreState((c) => ({ ...c, sacos_enviados_lotes: v }))} />
            <CampoCuadre label="A torrefacción" value={cuadreState.sacos_torrefaccion}
              onChange={(v) => setCuadreState((c) => ({ ...c, sacos_torrefaccion: v }))} />
            <CampoCuadre label="A venta" value={cuadreState.sacos_venta}
              onChange={(v) => setCuadreState((c) => ({ ...c, sacos_venta: v }))} />
            <CampoCuadre label="A otro lote" value={cuadreState.sacos_otro_lote}
              onChange={(v) => setCuadreState((c) => ({ ...c, sacos_otro_lote: v }))} />
            <CampoCuadre label="Repaso" value={cuadreState.sacos_repaso}
              onChange={(v) => setCuadreState((c) => ({ ...c, sacos_repaso: v }))} />
          </div>
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <strong>Sacos no enviados (calculado):</strong>{' '}
            <span className={`tabular-nums font-semibold ${sacosNoEnviados < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
              {sacosNoEnviados}
            </span>
            <span className="ml-2 text-xs text-slate-400">
              = {oroSacos} producidos + {cuadre.sacos_maquilas_previas} arrastre − {cuadre.sacos_enviados_lotes} lotes
              − {cuadre.sacos_torrefaccion} torrefacción − {cuadre.sacos_venta} venta − {cuadre.sacos_otro_lote} otro lote
            </span>
          </div>
        </Seccion>
      )}

      {/* 5. Lotes de embarque (opcional) */}
      <Seccion titulo="Lotes de embarque (opcional)">
        <div className="space-y-2">
          {lotes.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input type="number" placeholder="# lote" value={l.numero_lote}
                onChange={(e) => editarLote(i, 'numero_lote', e.target.value)}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
              <input type="number" placeholder="Sacos" value={l.sacos}
                onChange={(e) => editarLote(i, 'sacos', e.target.value)}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
              <input type="number" placeholder="Kg" value={l.kg}
                onChange={(e) => editarLote(i, 'kg', e.target.value)}
                className="w-24 rounded border border-slate-300 px-2 py-1 text-sm" />
              <input placeholder="Descripción" value={l.descripcion}
                onChange={(e) => editarLote(i, 'descripcion', e.target.value)}
                className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
              <button type="button" onClick={() => quitarLote(i)} className="text-xs text-rose-500 hover:text-rose-700">Quitar</button>
            </div>
          ))}
          <button type="button" onClick={agregarLote} className="text-xs font-medium text-orange-700 hover:underline">
            + Agregar lote
          </button>
        </div>
      </Seccion>

      {/* 6. Personas y firmas */}
      <Seccion titulo="Personas y firmas">
        <div className="grid gap-4 sm:grid-cols-2">
          {(['elaboro', 'entrego', 'retrillero', 'calador'] as const).map((rol) => (
            <div key={rol} className="rounded-md border border-slate-200 p-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {{ elaboro: 'Elaboró', entrego: 'Entregó', retrillero: 'Retrillero', calador: 'Calador' }[rol]}
              </label>
              <input
                value={nombres[rol]}
                onChange={(e) => setNombres((n) => ({ ...n, [rol]: e.target.value }))}
                placeholder="Nombre"
                className={`${INPUT} mb-2`}
              />
              <SignaturePad value={firmas[rol]} onChange={(v) => setFirmas((f) => ({ ...f, [rol]: v }))} />
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Observaciones">
        <textarea
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          rows={3}
          className={INPUT}
          placeholder="Cualquier nota sobre el corte…"
        />
      </Seccion>

      {/* Avisos */}
      {avisos.length > 0 && (
        <div className="space-y-1.5">
          {errores.map((a, i) => (
            <p key={`e${i}`} className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <strong>No cuadra: </strong>{a.mensaje}
            </p>
          ))}
          {revisar.map((a, i) => (
            <p key={`a${i}`} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <strong>Revisar: </strong>{a.mensaje}
            </p>
          ))}
        </div>
      )}
      {errorGuardar && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorGuardar}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || errores.length > 0}
          className="rounded-md bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar corte'}
        </button>
      </div>
    </div>
  )
}

const INPUT = 'w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800'

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{titulo}</h3>
      {children}
    </section>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-slate-500">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  )
}

function CampoCuadre({
  label, value, onChange, nota,
}: { label: string; value: string; onChange: (v: string) => void; nota?: string }) {
  return (
    <label className="block text-xs text-slate-500">
      <span className="mb-1 block">{label}</span>
      <input type="number" min="0" step="1" value={value} onChange={(e) => onChange(e.target.value)} className={INPUT} />
      {nota && <span className="mt-0.5 block text-[11px] text-slate-400">{nota}</span>}
    </label>
  )
}
