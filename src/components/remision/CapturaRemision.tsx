'use client'

// Captura de una remisión en campo. Diseñada para funcionar SIN SEÑAL, porque
// en las comunidades no la hay: los productores salen del caché local, la
// remisión se guarda en IndexedDB y se sincroniza cuando el promotor vuelve.
//
// Lo que NO se captura aquí, a propósito: los kilos reales. Se pesan en el
// beneficio. Lo único que se pide es lo que el productor CREE que lleva
// (opcional), para poder comparar contra la báscula y detectar el faltante del
// traslado. Pedir un peso que nadie midió sería inventar un dato.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Escaner from './Escaner'
import { obtenerCatalogos, enviarOEncolarRemision, contarRemisionesPendientes } from '@/lib/offline/sync'
import type { ProductorLite } from '@/lib/types'

const CICLO = '2025-2026'

const ESPECIES = [
  { especie: 'ARABE', tipos: ['PERGAMINO', 'ORO', 'CEREZO'] },
  { especie: 'ROBUSTA', tipos: ['CEREZO', 'PERGAMINO', 'ORO'] },
  { especie: 'CACAO', tipos: ['FERMENTADO', 'LAVADO'] },
]
const MATERIALES = ['yute', 'henequen', 'plastico']

export default function CapturaRemision() {
  const router = useRouter()
  const [productores, setProductores] = useState<ProductorLite[]>([])
  const [sinCatalogo, setSinCatalogo] = useState(false)
  const [pendientes, setPendientes] = useState(0)
  const [enLinea, setEnLinea] = useState(true)

  const [busqueda, setBusqueda] = useState('')
  const [productor, setProductor] = useState<ProductorLite | null>(null)
  const [especie, setEspecie] = useState('ARABE')
  const [tipo, setTipo] = useState('PERGAMINO')
  const [material, setMaterial] = useState('yute')
  const [kgDeclarado, setKgDeclarado] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [etiquetas, setEtiquetas] = useState<string[]>([])

  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    obtenerCatalogos()
      .then((c) => {
        if (!c) return setSinCatalogo(true)
        setProductores(c.productores)
      })
      .catch(() => setSinCatalogo(true))
    contarRemisionesPendientes().then(setPendientes)

    const actualizar = () => setEnLinea(navigator.onLine)
    actualizar()
    window.addEventListener('online', actualizar)
    window.addEventListener('offline', actualizar)
    return () => {
      window.removeEventListener('online', actualizar)
      window.removeEventListener('offline', actualizar)
    }
  }, [])

  const tiposDisponibles = ESPECIES.find((e) => e.especie === especie)?.tipos ?? []

  const coincidencias = busqueda.trim()
    ? productores
        .filter((p) =>
          `${p.nombre_completo} ${p.comunidad ?? ''} ${p.codigo ?? ''}`
            .toLowerCase()
            .includes(busqueda.toLowerCase()),
        )
        .slice(0, 8)
    : []

  async function guardar() {
    if (!productor) return setError('Elige al productor.')
    if (etiquetas.length === 0) return setError('Escanea al menos un saco.')

    setGuardando(true)
    setError(null)

    // La ubicación es un extra: si el GPS tarda o falla, la remisión se guarda
    // igual. Bloquear la captura por una coordenada sería absurdo con el camión
    // esperando.
    const coords = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null)
      const t = setTimeout(() => resolve(null), 4000)
      navigator.geolocation.getCurrentPosition(
        (p) => {
          clearTimeout(t)
          resolve({ lat: p.coords.latitude, lng: p.coords.longitude })
        },
        () => {
          clearTimeout(t)
          resolve(null)
        },
        { enableHighAccuracy: false, timeout: 4000 },
      )
    })

    try {
      const r = await enviarOEncolarRemision(
        {
          local_id: crypto.randomUUID(),
          fecha_remision: new Date().toISOString().slice(0, 10),
          ciclo: CICLO,
          productor_id: productor.id,
          proveedor_nombre: productor.nombre_completo,
          comunidad: productor.comunidad ?? null,
          municipio: productor.municipio ?? null,
          especie,
          tipo,
          material_saco: material,
          total_sacos: etiquetas.length,
          kg_declarado: kgDeclarado ? Number(kgDeclarado) : null,
          observaciones: observaciones.trim() || null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          etiquetas,
        },
        `${productor.nombre_completo} · ${etiquetas.length} sacos`,
      )

      if (r.online) {
        router.push('/acopio/remision')
        router.refresh()
      } else {
        setPendientes(await contarRemisionesPendientes())
        limpiar()
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  function limpiar() {
    setProductor(null)
    setBusqueda('')
    setEtiquetas([])
    setKgDeclarado('')
    setObservaciones('')
  }

  if (sinCatalogo) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        No hay catálogo de productores guardado en este teléfono. Conéctate una vez a internet y
        vuelve a abrir esta pantalla: se descarga y a partir de ahí funciona sin señal.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {(!enLinea || pendientes > 0) && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          {!enLinea && <span className="font-medium text-slate-800">Sin señal. </span>}
          {!enLinea && 'Las remisiones se guardan en el teléfono y se envían solas al recuperar red. '}
          {pendientes > 0 && `${pendientes} por sincronizar.`}
        </div>
      )}

      {/* Productor */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Productor</h2>
        {productor ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">
                {productor.nombre_completo}
              </p>
              <p className="truncate text-xs text-slate-500">
                {productor.comunidad ?? '—'}
                {productor.municipio ? ` · ${productor.municipio}` : ''}
              </p>
            </div>
            <button
              onClick={() => setProductor(null)}
              className="shrink-0 text-xs font-medium text-orange-700"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Busca por nombre, comunidad o código"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <ul className="mt-2 divide-y divide-slate-100">
              {coincidencias.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => {
                      setProductor(p)
                      setBusqueda('')
                    }}
                    className="w-full py-2 text-left"
                  >
                    <p className="text-sm text-slate-800">{p.nombre_completo}</p>
                    <p className="text-xs text-slate-500">{p.comunidad ?? '—'}</p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Producto */}
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">Producto</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">Especie</span>
            <select
              value={especie}
              onChange={(e) => {
                setEspecie(e.target.value)
                const t = ESPECIES.find((x) => x.especie === e.target.value)?.tipos ?? []
                setTipo(t[0] ?? '')
              }}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {ESPECIES.map((e) => (
                <option key={e.especie}>{e.especie}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {tiposDisponibles.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">Tipo de saco</span>
            <select
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {MATERIALES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-slate-500">
              Kilos que dice el productor
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={kgDeclarado}
              onChange={(e) => setKgDeclarado(e.target.value)}
              placeholder="opcional"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <p className="text-xs text-slate-400">
          El peso real lo da la báscula del beneficio. Este dato sólo sirve para comparar.
        </p>
      </section>

      {/* Sacos */}
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Sacos</h2>
          <span className="text-sm font-semibold tabular-nums text-orange-700">
            {etiquetas.length}
          </span>
        </div>

        <Escaner
          yaEscaneados={etiquetas}
          onCodigo={(c) => setEtiquetas((prev) => [...prev, c])}
        />

        {etiquetas.length > 0 && (
          <ul className="max-h-48 divide-y divide-slate-100 overflow-auto">
            {etiquetas.map((c, i) => (
              <li key={c} className="flex items-center justify-between py-1.5">
                <span className="font-mono text-xs text-slate-700">
                  <span className="mr-2 text-slate-400">{i + 1}</span>
                  {c}
                </span>
                <button
                  onClick={() => setEtiquetas((prev) => prev.filter((x) => x !== c))}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-slate-500">Observaciones</span>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </section>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button
        onClick={guardar}
        disabled={guardando || !productor || etiquetas.length === 0}
        className="w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-40"
      >
        {guardando
          ? 'Guardando…'
          : enLinea
            ? `Guardar remisión (${etiquetas.length} sacos)`
            : `Guardar en el teléfono (${etiquetas.length} sacos)`}
      </button>
    </div>
  )
}
