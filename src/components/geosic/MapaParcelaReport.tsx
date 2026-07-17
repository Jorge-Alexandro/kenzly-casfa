'use client'

// Mapa imprimible de una parcela (estilo MAYACERT): polígono sobre satélite,
// coordenadas de vértices, colindancias N/S/E/O, simbología, pendiente y
// superficies. Usa la Static Images API de Mapbox (no necesita mapa interactivo,
// así imprime bien). Botón "Imprimir" → window.print().
import { NIVEL_CERT_LABEL, NIVEL_CERT_NOMBRE } from '@/lib/types'
import type { MapaParcela } from '@/lib/data/mapa'
import { codigoCorto } from '@/lib/format'

const OLIVO = '#8a8d1f'

export default function MapaParcelaReport({
  data,
  token,
}: {
  data: MapaParcela
  token: string
}) {
  const cod = codigoCorto(data.parcela.codigo_parcela, data.parcela.nombre)
  const nivel = data.estatus_nivel

  // Vértices para la lista de coordenadas (sin repetir el cierre del anillo).
  const verts = data.vertices ? data.vertices.slice(0, -1) : []

  // URL de la imagen satelital con el polígono dibujado.
  let mapUrl: string | null = null
  if (data.geojson && token) {
    // Simplificar si hay demasiados vértices (límite de longitud de la URL).
    let g = data.geojson
    const ring = g.coordinates[0]
    if (ring.length > 80) {
      const paso = Math.ceil(ring.length / 80)
      const r = ring.filter((_, i) => i % paso === 0)
      if (r[r.length - 1] !== ring[ring.length - 1]) r.push(ring[ring.length - 1])
      g = { type: 'Polygon', coordinates: [r] }
    }
    const overlay = {
      type: 'Feature',
      properties: {
        stroke: '#22d3ee',
        'stroke-width': 3,
        fill: '#22d3ee',
        'fill-opacity': 0.12,
      },
      geometry: g,
    }
    const enc = encodeURIComponent(JSON.stringify(overlay))
    mapUrl = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/geojson(${enc})/auto/760x520@2x?padding=60&access_token=${token}`
  }

  const col = data.colindancias

  return (
    <div className="min-h-screen overflow-auto bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{`@page { size: landscape; margin: 10mm; } @media print { .no-print { display: none !important; } }`}</style>

      <div className="mx-auto max-w-5xl">
        <div className="no-print mb-3 flex items-center justify-between">
          <a href={`/geosic`} className="text-sm text-slate-500 hover:text-slate-700">← GeoSIC</a>
          <button
            onClick={() => window.print()}
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            Imprimir / Guardar PDF
          </button>
        </div>

        {/* Marco estilo MAYACERT */}
        <div
          className="bg-white p-4"
          style={{ border: `6px solid ${OLIVO}`, outline: `2px solid ${OLIVO}`, outlineOffset: '3px' }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(200px,34%)_1fr]">
            {/* Columna izquierda: productor + coordenadas */}
            <div>
              <h1 className="text-lg font-bold uppercase leading-tight" style={{ color: OLIVO }}>
                {data.productor.nombre_completo}
              </h1>
              <p className="text-base font-semibold" style={{ color: OLIVO }}>
                {nivel ? NIVEL_CERT_NOMBRE[nivel].toUpperCase() : 'SIN ESTATUS'}
              </p>
              <p className="text-sm font-semibold text-blue-800">{data.parcela.codigo_parcela}</p>

              <p className="mt-3 text-center text-sm font-bold" style={{ color: OLIVO }}>COORDENADAS</p>
              <div className="mt-1 border-t" style={{ borderColor: OLIVO }}>
                {verts.length === 0 ? (
                  <p className="py-2 text-center text-xs text-slate-400">Sin polígono cargado</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {verts.map(([lng, lat], i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="py-1 pr-2 font-medium text-slate-500">{i + 1}</td>
                          <td className="py-1 tabular-nums text-slate-700">
                            {lat.toFixed(6)}<br />{lng.toFixed(6)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Columna derecha: mapa con colindancias */}
            <div>
              <div className="relative">
                <span className="absolute left-2 top-2 z-10 rounded bg-black/40 px-2 py-0.5 text-sm font-semibold italic text-white">
                  {data.parcela.nombre || cod}
                </span>
                {mapUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mapUrl} alt="Mapa satelital de la parcela" className="w-full rounded" />
                ) : (
                  <div className="flex h-64 items-center justify-center rounded bg-slate-200 text-sm text-slate-500">
                    Esta parcela no tiene polígono. Súbelo en GeoSIC.
                  </div>
                )}
                {/* Colindancias N/S/E/O */}
                {mapUrl && (
                  <>
                    <Colinda pos="top" texto={col.norte} />
                    <Colinda pos="bottom" texto={col.sur} />
                    <Colinda pos="right" texto={col.este} />
                    <Colinda pos="left" texto={col.oeste} />
                  </>
                )}
              </div>
              <p className="mt-1 text-center text-sm font-bold uppercase text-slate-700">
                {[data.parcela.comunidad, data.parcela.municipio].filter(Boolean).join(', ')}
              </p>
            </div>
          </div>

          {/* Pie: simbología + datos */}
          <div className="mt-4 grid grid-cols-1 gap-3 border-t pt-3 md:grid-cols-[1fr_auto]" style={{ borderColor: OLIVO }}>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span className="font-bold" style={{ color: OLIVO }}>SIMBOLOGÍA</span>
              <Simbolo color="#65a30d" tipo="plantas" label="Zonas de amortiguamiento" />
              <Simbolo color="#f59e0b" tipo="dash" label="Veredas, caminos o carreteras" />
              <Simbolo color="#0ea5e9" tipo="wave" label="Ríos" />
            </div>
            <div className="text-right text-xs">
              <p><span className="font-semibold" style={{ color: OLIVO }}>PENDIENTE:</span> {data.pendiente || '—'}</p>
              <p><span className="font-semibold" style={{ color: OLIVO }}>SUPERFICIE TOTAL:</span> {fmt(data.parcela.superficie_total_ha)}</p>
              <p><span className="font-semibold" style={{ color: OLIVO }}>SUPERFICIE CULTIVADA:</span> {fmt(data.parcela.superficie_cultivada_ha)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Colinda({ pos, texto }: { pos: 'top' | 'bottom' | 'left' | 'right'; texto: string }) {
  if (!texto) return null
  const base = 'absolute z-10 max-w-[45%] text-center text-[10px] font-semibold uppercase leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]'
  const p = {
    top: 'left-1/2 top-1 -translate-x-1/2',
    bottom: 'left-1/2 bottom-1 -translate-x-1/2',
    left: 'left-1 top-1/2 -translate-y-1/2 [writing-mode:vertical-rl] rotate-180',
    right: 'right-1 top-1/2 -translate-y-1/2 [writing-mode:vertical-rl]',
  }[pos]
  return <span className={`${base} ${p}`}>{texto}</span>
}

function Simbolo({ color, tipo, label }: { color: string; tipo: 'plantas' | 'dash' | 'wave'; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="34" height="12" viewBox="0 0 34 12">
        {tipo === 'dash' && <line x1="0" y1="6" x2="34" y2="6" stroke={color} strokeWidth="2.5" strokeDasharray="5 3" />}
        {tipo === 'wave' && <path d="M0 6 Q4 2 8 6 T16 6 T24 6 T32 6" stroke={color} strokeWidth="2" fill="none" />}
        {tipo === 'plantas' &&
          [2, 12, 22].map((x) => (
            <path key={x} d={`M${x + 3} 11 V6 M${x + 3} 7 L${x} 4 M${x + 3} 7 L${x + 6} 4`} stroke={color} strokeWidth="1.5" fill="none" />
          ))}
      </svg>
      {label}
    </span>
  )
}

function fmt(v: number | null): string {
  return v != null ? `${v.toFixed(2)} ha` : '—'
}
