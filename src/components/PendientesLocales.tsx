'use client'

// Lo que este dispositivo lleva capturado y todavía no sube.
//
// Antes esta cola era una caja negra: se veía el contador "3 por subir" y nada
// más. Pero los inspectores son personas y se equivocan — ponen la parcela que
// no era, se saltan una pregunta, escriben mal un dato — y hasta ahora tenían
// que esperar a tener señal para poder corregirlo. Aquí se abre, se corrige y
// se vuelve a guardar EN LA COLA, sin subir nada y sin salir de la pantalla
// (una navegación sin señal rebota a /offline y se pierde el trabajo).
//
// También se puede descartar una captura equivocada, que es la otra mitad del
// problema: sin esto, un levantamiento hecho por error se subía igual.
import { useCallback, useEffect, useState } from 'react'
import FichaCaptureClient from '@/components/fichas/FichaCaptureClient'
import BitacoraEditor from '@/components/bitacora/BitacoraEditor'
import HistorialEditor from '@/components/historial/HistorialEditor'
import { codigoCorto } from '@/lib/format'
import { normalizarDatos, type BitacoraDatos } from '@/lib/bitacora'
import {
  listarPendientes,
  listarBitacorasPendientes,
  listarHistorialesPendientes,
  quitarPendiente,
  quitarBitacoraPendiente,
  quitarHistorialPendiente,
  leerCatalogos,
  type FichaPendiente,
  type BitacoraPendiente,
  type HistorialPendiente,
} from '@/lib/offline/db'
import type { ParcelaLite, TipoFicha } from '@/lib/types'
import { TIPO_FICHA_LABEL } from '@/lib/types'
import type { HistorialAnio } from '@/lib/historial'

type Abierto =
  | { tipo: 'ficha'; item: FichaPendiente }
  | { tipo: 'bitacora'; item: BitacoraPendiente }
  | { tipo: 'historial'; item: HistorialPendiente }
  | null

export default function PendientesLocales({
  titulo = 'Capturado en este dispositivo (falta subir)',
}: {
  titulo?: string
}) {
  const [fichas, setFichas] = useState<FichaPendiente[]>([])
  const [bitacoras, setBitacoras] = useState<BitacoraPendiente[]>([])
  const [historiales, setHistoriales] = useState<HistorialPendiente[]>([])
  const [parcelas, setParcelas] = useState<ParcelaLite[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [abierto, setAbierto] = useState<Abierto>(null)
  const [porDescartar, setPorDescartar] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    const [f, b, h, cat] = await Promise.all([
      listarPendientes().catch(() => []),
      listarBitacorasPendientes().catch(() => []),
      listarHistorialesPendientes().catch(() => []),
      leerCatalogos().catch(() => null),
    ])
    setFichas(f)
    setBitacoras(b)
    setHistoriales(h)
    setParcelas(cat?.parcelas ?? [])
    setNombres(
      Object.fromEntries((cat?.productores ?? []).map((p) => [p.id, p.nombre_completo])),
    )
  }, [])

  useEffect(() => {
    recargar()
    // La cola se vacía sola al volver la señal: hay que reflejarlo.
    const t = setInterval(recargar, 10000)
    window.addEventListener('online', recargar)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', recargar)
    }
  }, [recargar])

  function cerrar() {
    setAbierto(null)
    recargar()
  }

  const parcelaDe = (id: string) => parcelas.find((p) => p.id === id) ?? null
  const etiquetaParcela = (id: string) => {
    const p = parcelaDe(id)
    if (!p) return 'Parcela'
    const cod = codigoCorto(p.codigo_parcela, p.nombre)
    return `${p.nombre || cod} · ${cod}`
  }

  // --- Edición en el lugar --------------------------------------------------
  if (abierto?.tipo === 'ficha') {
    const b = abierto.item.body
    return (
      <Marco titulo={`Corrigiendo · ${abierto.item.etiqueta}`} onVolver={cerrar}>
        <FichaCaptureClient
          fichaEdicion={{
            id: null,
            local_id: abierto.item.local_id,
            tipo: b.tipo as TipoFicha,
            template_id: b.template_id,
            productor_id: b.productor_id,
            parcela_ids: b.parcela_ids,
            fecha_inspeccion: b.fecha_inspeccion,
            respuestas: b.respuestas,
            estado: b.estado,
          }}
          onGuardada={cerrar}
        />
      </Marco>
    )
  }

  if (abierto?.tipo === 'bitacora') {
    const b = abierto.item.body
    return (
      <Marco titulo={`Corrigiendo · ${abierto.item.etiqueta}`} onVolver={cerrar}>
        <BitacoraEditor
          mode="editar"
          parcelaFija={{ id: b.parcela_id, label: etiquetaParcela(b.parcela_id) }}
          anioInicial={b.anio}
          datosIniciales={normalizarDatos((b.datos ?? null) as Partial<BitacoraDatos> | null)}
          fichaId={b.ficha_id ?? undefined}
          localId={abierto.item.local_id}
          onGuardada={cerrar}
        />
      </Marco>
    )
  }

  if (abierto?.tipo === 'historial') {
    const b = abierto.item.body
    return (
      <Marco titulo={`Corrigiendo · ${abierto.item.etiqueta}`} onVolver={cerrar}>
        <HistorialEditor
          parcelaId={b.parcela_id}
          parcelaLabel={etiquetaParcela(b.parcela_id)}
          aniosIniciales={b.anios as HistorialAnio[]}
          localId={abierto.item.local_id}
          onGuardado={cerrar}
        />
      </Marco>
    )
  }

  // --- Listado ---------------------------------------------------------------
  const total = fichas.length + bitacoras.length + historiales.length
  if (total === 0) return null

  async function descartar(tipo: 'ficha' | 'bitacora' | 'historial', localId: string) {
    if (tipo === 'ficha') await quitarPendiente(localId)
    if (tipo === 'bitacora') await quitarBitacoraPendiente(localId)
    if (tipo === 'historial') await quitarHistorialPendiente(localId)
    setPorDescartar(null)
    recargar()
  }

  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 px-4 py-2.5">
        <span className="text-sm font-semibold text-amber-900">{titulo}</span>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">
          {total} por subir
        </span>
      </div>

      <ul className="divide-y divide-amber-100">
        {fichas.map((f) => (
          <Fila
            key={f.local_id}
            insignia="Ficha"
            titulo={`${TIPO_FICHA_LABEL[f.body.tipo as TipoFicha] ?? f.body.tipo} · ${nombres[f.body.productor_id] ?? 'Productor'}`}
            detalle={`${f.body.parcela_ids.length} parcela(s) · ${f.body.fecha_inspeccion ?? 'sin fecha'} · ${f.body.estado === 'en_revision' ? 'En revisión' : 'Borrador'}`}
            creada={f.creada_en}
            confirmando={porDescartar === f.local_id}
            onAbrir={() => setAbierto({ tipo: 'ficha', item: f })}
            onDescartar={() => setPorDescartar(f.local_id)}
            onCancelar={() => setPorDescartar(null)}
            onConfirmar={() => descartar('ficha', f.local_id)}
          />
        ))}
        {bitacoras.map((b) => (
          <Fila
            key={b.local_id}
            insignia="Bitácora"
            titulo={etiquetaParcela(b.body.parcela_id)}
            detalle={`Año ${b.body.anio}`}
            creada={b.creada_en}
            confirmando={porDescartar === b.local_id}
            onAbrir={() => setAbierto({ tipo: 'bitacora', item: b })}
            onDescartar={() => setPorDescartar(b.local_id)}
            onCancelar={() => setPorDescartar(null)}
            onConfirmar={() => descartar('bitacora', b.local_id)}
          />
        ))}
        {historiales.map((h) => (
          <Fila
            key={h.local_id}
            insignia="Historial"
            titulo={etiquetaParcela(h.body.parcela_id)}
            detalle={`${h.body.anios.length} año(s)`}
            creada={h.creada_en}
            confirmando={porDescartar === h.local_id}
            onAbrir={() => setAbierto({ tipo: 'historial', item: h })}
            onDescartar={() => setPorDescartar(h.local_id)}
            onCancelar={() => setPorDescartar(null)}
            onConfirmar={() => descartar('historial', h.local_id)}
          />
        ))}
      </ul>

      <p className="border-t border-amber-100 px-4 py-2 text-xs text-amber-800">
        Se suben solas al recuperar señal. Mientras tanto puedes corregirlas
        aquí: los cambios se quedan en el dispositivo.
      </p>
    </div>
  )
}

function Fila({
  insignia,
  titulo,
  detalle,
  creada,
  confirmando,
  onAbrir,
  onDescartar,
  onCancelar,
  onConfirmar,
}: {
  insignia: string
  titulo: string
  detalle: string
  creada: number
  confirmando: boolean
  onAbrir: () => void
  onDescartar: () => void
  onCancelar: () => void
  onConfirmar: () => void
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
            {insignia}
          </span>
          <span className="truncate text-sm font-medium text-slate-800">{titulo}</span>
        </div>
        <p className="mt-0.5 text-xs text-slate-600">
          {detalle} ·{' '}
          {new Date(creada).toLocaleString('es-MX', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </p>
      </div>

      {confirmando ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-700">¿Descartar sin subir?</span>
          <button
            onClick={onConfirmar}
            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            Sí, borrar
          </button>
          <button
            onClick={onCancelar}
            className="rounded-md px-2.5 py-1 text-xs text-slate-600 hover:bg-white"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onAbrir}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            Ver / corregir
          </button>
          <button
            onClick={onDescartar}
            className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-white hover:text-red-700"
          >
            Descartar
          </button>
        </div>
      )}
    </li>
  )
}

function Marco({
  titulo,
  onVolver,
  children,
}: {
  titulo: string
  onVolver: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-sky-200 bg-white">
      <div className="flex items-center gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2.5">
        <button
          onClick={onVolver}
          className="rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-white"
        >
          ← Atrás
        </button>
        <span className="truncate text-sm font-semibold text-sky-900">{titulo}</span>
      </div>
      {children}
    </div>
  )
}
