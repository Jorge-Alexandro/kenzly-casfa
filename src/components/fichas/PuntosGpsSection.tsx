'use client'

// Levantamiento del polígono desde la ficha, caminando el predio.
//
// Dos formas de trabajar, porque en campo se dan las dos:
//   · Punto por punto — el inspector se para en cada esquina y marca. Es lo
//     más preciso y lo normal en parcelas con vértices claros.
//   · Recorrido — se camina el lindero y la app va soltando puntos sola hasta
//     que el inspector la detiene. Sirve cuando el lindero es una curva (un
//     río, una barranca) y no hay esquinas que marcar.
//
// Todo se guarda en las respuestas de la ficha (clave por parcela). Al guardar,
// el servidor arma el polígono en GeoSIC. Funciona sin señal: el GPS del
// dispositivo no necesita internet.
import { useEffect, useRef, useState } from 'react'
import { codigoCorto } from '@/lib/format'
import {
  areaHa,
  perimetroM,
  distanciaM,
  clavePuntos,
  leerPuntos,
  type PuntoGps,
} from '@/lib/geo/puntos'
import type { ParcelaLite } from '@/lib/types'

// En recorrido: no soltar un punto si el GPS no se ha movido lo suficiente
// (evita cientos de lecturas del mismo lugar mientras se abre una tranca), ni
// si la lectura viene demasiado sucia para servir de vértice.
const MIN_METROS = 8
const MAX_IMPRECISION_M = 30

export default function PuntosGpsSection({
  parcelas,
  respuestas,
  onPuntos,
}: {
  parcelas: ParcelaLite[]
  respuestas: Record<string, unknown>
  onPuntos: (clave: string, puntos: PuntoGps[]) => void
}) {
  const [parcelaId, setParcelaId] = useState(parcelas[0]?.id ?? '')
  const [recorriendo, setRecorriendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ultima, setUltima] = useState<PuntoGps | null>(null)
  const watchRef = useRef<number | null>(null)

  // Si cambian las parcelas de la ficha, no dejar seleccionada una que ya no está.
  useEffect(() => {
    if (!parcelas.some((p) => p.id === parcelaId)) setParcelaId(parcelas[0]?.id ?? '')
  }, [parcelas, parcelaId])

  // Un recorrido abierto consume batería y GPS: cortarlo al desmontar.
  useEffect(() => {
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current)
    }
  }, [])

  const parcela = parcelas.find((p) => p.id === parcelaId) ?? null
  const puntos = parcela ? leerPuntos(respuestas, parcela.id) : []

  function guardar(nuevos: PuntoGps[]) {
    if (parcela) onPuntos(clavePuntos(parcela.id), nuevos)
  }

  function agregar(pos: GeolocationPosition, soloSiSeMovio: boolean) {
    const p: PuntoGps = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      acc: pos.coords.accuracy ?? null,
      t: Date.now(),
    }
    setUltima(p)
    if (soloSiSeMovio) {
      if (p.acc !== null && p.acc > MAX_IMPRECISION_M) return
      const prev = puntosRef.current[puntosRef.current.length - 1]
      if (prev && distanciaM(prev, p) < MIN_METROS) return
    }
    const nuevos = [...puntosRef.current, p]
    puntosRef.current = nuevos
    guardar(nuevos)
  }

  // El watch de geolocalización vive fuera de React y necesita ver los puntos
  // actuales sin re-suscribirse en cada lectura.
  const puntosRef = useRef<PuntoGps[]>(puntos)
  useEffect(() => {
    puntosRef.current = puntos
  }, [puntos])

  function marcarPunto() {
    if (!parcela) return setError('Elige la parcela que estás recorriendo.')
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => agregar(pos, false),
      (e) => setError(mensajeGps(e)),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  }

  function iniciarRecorrido() {
    if (!parcela) return setError('Elige la parcela que estás recorriendo.')
    setError(null)
    setRecorriendo(true)
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => agregar(pos, true),
      (e) => {
        setError(mensajeGps(e))
        detenerRecorrido()
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
    )
  }

  function detenerRecorrido() {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
    }
    setRecorriendo(false)
  }

  function borrarPunto(i: number) {
    const nuevos = puntos.filter((_, j) => j !== i)
    puntosRef.current = nuevos
    guardar(nuevos)
  }

  const area = areaHa(puntos)
  const declarada = Number(parcela?.superficie_declarada_ha ?? 0) || null
  const dif = declarada && area > 0 ? ((area - declarada) / declarada) * 100 : null

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Camina el lindero de la parcela y marca los puntos. Con 3 o más se arma
        el polígono al guardar la ficha. El GPS funciona sin señal.
      </p>

      {parcelas.length > 1 && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            ¿Qué parcela estás recorriendo?
          </span>
          <select
            value={parcelaId}
            onChange={(e) => {
              detenerRecorrido()
              setParcelaId(e.target.value)
            }}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
          >
            {parcelas.map((p) => (
              <option key={p.id} value={p.id}>
                {codigoCorto(p.codigo_parcela, p.nombre)}
                {p.nombre ? ` — ${p.nombre}` : ''} ·{' '}
                {leerPuntos(respuestas, p.id).length} punto(s)
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={marcarPunto}
          className="rounded-md bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-600"
        >
          + Marcar punto aquí
        </button>
        {recorriendo ? (
          <button
            type="button"
            onClick={detenerRecorrido}
            className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700"
          >
            ■ Detener recorrido
          </button>
        ) : (
          <button
            type="button"
            onClick={iniciarRecorrido}
            className="rounded-md border border-orange-300 bg-white px-4 py-2.5 text-sm font-medium text-orange-700 hover:bg-orange-50"
          >
            ▶ Iniciar recorrido
          </button>
        )}
      </div>

      {recorriendo && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Recorriendo… se marca un punto cada {MIN_METROS} m que avances. Pulsa
          <strong> Detener</strong> al cerrar la vuelta.
          {ultima?.acc != null && (
            <span className="block text-xs">
              Precisión actual del GPS: ±{Math.round(ultima.acc)} m
            </span>
          )}
        </p>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="rounded-lg border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-sm">
          <span className="font-medium text-slate-700">
            {puntos.length} punto{puntos.length === 1 ? '' : 's'}
          </span>
          {puntos.length >= 3 && (
            <span className="text-slate-600">
              {area.toFixed(3)} ha · perímetro {Math.round(perimetroM(puntos))} m
              {dif !== null && (
                <span
                  className={
                    Math.abs(dif) > 20
                      ? 'ml-2 font-medium text-red-600'
                      : 'ml-2 text-slate-500'
                  }
                >
                  ({dif > 0 ? '+' : ''}
                  {dif.toFixed(0)}% vs. {declarada} ha declaradas)
                </span>
              )}
            </span>
          )}
        </div>

        {puntos.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-400">
            Todavía no has marcado ningún punto.
          </p>
        ) : (
          <ul className="max-h-64 divide-y divide-slate-50 overflow-y-auto">
            {puntos.map((p, i) => (
              <li key={p.t} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="tabular-nums text-slate-700">
                  <span className="mr-2 inline-block w-6 text-xs text-slate-400">
                    {i + 1}
                  </span>
                  {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                  {p.acc != null && (
                    <span className="ml-2 text-xs text-slate-500">±{Math.round(p.acc)} m</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => borrarPunto(i)}
                  className="rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-red-50 hover:text-red-700"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {puntos.length > 0 && puntos.length < 3 && (
        <p className="text-xs text-amber-700">
          Faltan {3 - puntos.length} punto(s) para poder cerrar un polígono.
        </p>
      )}
      {dif !== null && Math.abs(dif) > 20 && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          El área caminada difiere más de 20% de la superficie declarada. Revisa
          que hayas cerrado la vuelta completa antes de guardar.
        </p>
      )}
    </div>
  )
}

function mensajeGps(e: GeolocationPositionError): string {
  if (e.code === e.PERMISSION_DENIED)
    return 'El dispositivo no dio permiso de ubicación. Actívalo para la app y vuelve a intentar.'
  if (e.code === e.POSITION_UNAVAILABLE)
    return 'El GPS no encuentra señal. Sal a cielo abierto y espera unos segundos.'
  if (e.code === e.TIMEOUT)
    return 'El GPS tardó demasiado en responder. Intenta de nuevo sin moverte.'
  return 'No se pudo leer la ubicación.'
}
