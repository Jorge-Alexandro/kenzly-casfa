'use client'

// Panel de detalle satelital de una parcela: alerta actual, los 3 índices de la
// última imagen y la serie de NDVI de los últimos 6 meses.
// El histórico se pide bajo demanda (no viaja en el payload de la página).
import { useEffect, useState } from 'react'
import type { ParcelaSateliteRow, IndiceHistorial } from '@/lib/satelite/indices'
import {
  ALERTA_COLOR,
  ALERTA_LABEL,
  ALERTA_DESCRIPCION,
  fmtNdvi,
  colorNdvi,
} from '@/lib/satelite/indices'
import GraficaNdvi from './GraficaNdvi'

export default function SatelitePanel({
  parcela,
  onClose,
}: {
  parcela: ParcelaSateliteRow
  onClose: () => void
}) {
  const [historial, setHistorial] = useState<IndiceHistorial[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    setHistorial(null)
    setError(null)

    fetch(`/api/sentinel/historial?parcela_id=${parcela.id}&meses=6`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
        if (!cancelado) setHistorial(body.historial as IndiceHistorial[])
      })
      .catch((e) => {
        if (!cancelado) setError(e instanceof Error ? e.message : 'Error desconocido')
      })

    // Evita pintar la respuesta de una parcela que ya no está seleccionada.
    return () => {
      cancelado = true
    }
  }, [parcela.id])

  const alerta = parcela.alerta ?? 'sin_datos'
  const tieneMedicion = parcela.ndvi_promedio !== null

  return (
    <aside className="absolute inset-0 z-40 flex flex-col border-slate-200 bg-white md:static md:z-auto md:w-80 md:shrink-0 md:border-l">
      <div className="flex items-start justify-between border-b border-slate-100 p-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-slate-800">
            {parcela.nombre || parcela.codigo_parcela}
          </h2>
          <p className="truncate text-xs text-slate-500">{parcela.productor_nombre}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* Alerta: es lo primero que el coordinador necesita saber. */}
        <div
          className="rounded-md p-3"
          style={{ background: `${ALERTA_COLOR[alerta]}14` }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: ALERTA_COLOR[alerta] }}
            />
            <span
              className="text-sm font-semibold"
              style={{ color: ALERTA_COLOR[alerta] }}
            >
              {ALERTA_LABEL[alerta]}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">{ALERTA_DESCRIPCION[alerta]}</p>
        </div>

        {!parcela.tiene_poligono && (
          <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-500">
            Esta parcela no tiene polígono. Sube su KML/KMZ en GeoSIC y el
            satélite podrá medirla.
          </p>
        )}

        {tieneMedicion && (
          <>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                NDVI
              </span>
              <span
                className="text-2xl font-semibold tabular-nums"
                style={{ color: colorNdvi(parcela.ndvi_promedio) }}
              >
                {fmtNdvi(parcela.ndvi_promedio)}
              </span>
            </div>

            <Field
              label="Rango en la parcela"
              value={`${fmtNdvi(parcela.ndvi_min)} – ${fmtNdvi(parcela.ndvi_max)}`}
            />
            <Field label="EVI (bajo sombra)" value={fmtNdvi(parcela.evi_promedio)} />
            <Field label="NDWI (agua en hoja)" value={fmtNdvi(parcela.ndwi_promedio)} />
            <Field
              label="Nubosidad descartada"
              value={
                parcela.cobertura_nubes !== null
                  ? `${parcela.cobertura_nubes.toFixed(0)}%`
                  : '—'
              }
            />
            <Field label="Fecha de imagen" value={parcela.fecha_imagen ?? '—'} />

            <div className="my-3 h-px bg-slate-100" />

            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              NDVI — últimos 6 meses
            </p>
            {error ? (
              <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">{error}</p>
            ) : historial === null ? (
              <p className="text-sm text-slate-400">Cargando serie…</p>
            ) : (
              <GraficaNdvi datos={historial} />
            )}
          </>
        )}

        {parcela.tiene_poligono && !tieneMedicion && (
          <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-500">
            Sin medición todavía. Usa «Actualizar satélite» para traer las
            imágenes de Sentinel-2 de esta parcela.
          </p>
        )}

        <div className="mt-4 border-t border-slate-100 pt-3">
          <Field label="Superficie declarada" value={fmtHa(parcela.superficie_declarada_ha)} />
          <Field label="Área medida" value={fmtHa(parcela.area_calc_ha)} />
          <Field label="Comunidad" value={parcela.comunidad || '—'} />
          <Field label="Cultivo" value={parcela.tipo_cultivo} />
        </div>
      </div>
    </aside>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800">{value}</span>
    </div>
  )
}

function fmtHa(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return `${v.toFixed(2)} ha`
}
