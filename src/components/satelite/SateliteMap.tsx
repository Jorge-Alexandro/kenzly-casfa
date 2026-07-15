'use client'

// Mapa del módulo satelital. Misma base que GeoSICMap (Mapbox GL directo, guard
// de contenedor a 0px, ResizeObserver) pero el relleno se interpola por NDVI:
// del café/rojo (suelo desnudo, estrés severo) al verde oscuro (dosel denso).
import { useEffect, useRef, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
// NOTA: la CSS de mapbox-gl se importa globalmente en app/globals.css.
import type { ParcelaSateliteRow } from '@/lib/satelite/indices'
import { ESCALA_NDVI, ALERTA_COLOR } from '@/lib/satelite/indices'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const TAPACHULA: [number, number] = [-92.26, 14.9]

// -999 es el centinela de "sin medición": Mapbox no interpola sobre null.
const SIN_DATOS = -999

// ['case', sin datos -> gris, ['interpolate', ...escala NDVI...]]
function colorNdviExpression(): mapboxgl.ExpressionSpecification {
  const paradas = ESCALA_NDVI.flatMap((p) => [p.valor, p.color])
  return [
    'case',
    ['<=', ['get', 'ndvi'], SIN_DATOS],
    ALERTA_COLOR.sin_datos,
    ['interpolate', ['linear'], ['get', 'ndvi'], ...paradas],
  ] as unknown as mapboxgl.ExpressionSpecification
}

interface Props {
  parcelas: ParcelaSateliteRow[]
  polygons: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function SateliteMap({
  parcelas,
  polygons,
  selectedId,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const loadedRef = useRef(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Pines en el centroide, coloreados por la ALERTA (no por NDVI crudo): así el
  // coordinador ubica de un vistazo las parcelas que piden inspección.
  const buildPins = useCallback(
    (): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
      type: 'FeatureCollection',
      features: parcelas
        .filter((p) => p.centroide_lat !== null && p.centroide_lng !== null)
        .map((p) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [p.centroide_lng!, p.centroide_lat!],
          },
          properties: {
            parcela_id: p.id,
            color: ALERTA_COLOR[p.alerta ?? 'sin_datos'],
            // Las parcelas normales no necesitan gritar: pin chico.
            alertada:
              p.alerta && p.alerta !== 'normal' && p.alerta !== 'sin_datos' ? 1 : 0,
          },
        })),
    }),
    [parcelas],
  )

  useEffect(() => {
    let rafId = 0
    let ro: ResizeObserver | null = null

    // Igual que en GeoSIC: no inicializamos hasta que el contenedor mide >0px,
    // si no Mapbox mide 0 y nunca pinta.
    function init() {
      const container = containerRef.current
      if (mapRef.current || !container) return
      if (container.clientHeight === 0 || container.clientWidth === 0) {
        rafId = requestAnimationFrame(init)
        return
      }

      const map = new mapboxgl.Map({
        container,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: TAPACHULA,
        zoom: 9,
      })
      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl(), 'top-right')
      map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }))

      map.on('error', (e) => {
        console.error('[mapbox] error:', e.error?.message ?? e)
      })
      map.on('load', () => map.resize())

      map.on('load', () => {
        map.addSource('sat-polygons', { type: 'geojson', data: polygons })
        map.addLayer({
          id: 'sat-fill',
          type: 'fill',
          source: 'sat-polygons',
          paint: {
            'fill-color': colorNdviExpression(),
            'fill-opacity': 0.55,
          },
        })
        map.addLayer({
          id: 'sat-line',
          type: 'line',
          source: 'sat-polygons',
          paint: {
            'line-color': '#ffffff',
            'line-width': [
              'case',
              ['==', ['get', 'parcela_id'], selectedId ?? ''],
              3,
              0.8,
            ],
            'line-opacity': 0.9,
          },
        })

        map.addSource('sat-pins', { type: 'geojson', data: buildPins() })
        map.addLayer({
          id: 'sat-pins',
          type: 'circle',
          source: 'sat-pins',
          paint: {
            'circle-radius': [
              'case',
              ['==', ['get', 'parcela_id'], selectedId ?? ''],
              9,
              ['==', ['get', 'alertada'], 1],
              6,
              4,
            ],
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
          },
        })

        const handleClick = (
          e: mapboxgl.MapMouseEvent & { features?: mapboxgl.GeoJSONFeature[] },
        ) => {
          const id = e.features?.[0]?.properties?.parcela_id as string | undefined
          if (id) onSelectRef.current(id)
        }
        map.on('click', 'sat-fill', handleClick)
        map.on('click', 'sat-pins', handleClick)

        for (const layer of ['sat-fill', 'sat-pins']) {
          map.on('mouseenter', layer, () => {
            map.getCanvas().style.cursor = 'pointer'
          })
          map.on('mouseleave', layer, () => {
            map.getCanvas().style.cursor = ''
          })
        }

        loadedRef.current = true
        fitToData(map, polygons, buildPins())
      })

      ro = new ResizeObserver(() => map.resize())
      ro.observe(container)
    }

    init()

    return () => {
      cancelAnimationFrame(rafId)
      ro?.disconnect()
      mapRef.current?.remove()
      mapRef.current = null
      loadedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Datos nuevos tras "Actualizar datos satelitales" (router.refresh()).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    ;(map.getSource('sat-polygons') as mapboxgl.GeoJSONSource | undefined)?.setData(
      polygons,
    )
    ;(map.getSource('sat-pins') as mapboxgl.GeoJSONSource | undefined)?.setData(
      buildPins(),
    )
  }, [polygons, buildPins])

  // Resaltar y volar a la parcela seleccionada.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    if (map.getLayer('sat-line')) {
      map.setPaintProperty('sat-line', 'line-width', [
        'case',
        ['==', ['get', 'parcela_id'], selectedId ?? ''],
        3,
        0.8,
      ])
    }
    if (map.getLayer('sat-pins')) {
      map.setPaintProperty('sat-pins', 'circle-radius', [
        'case',
        ['==', ['get', 'parcela_id'], selectedId ?? ''],
        9,
        ['==', ['get', 'alertada'], 1],
        6,
        4,
      ])
    }

    if (!selectedId) return
    const p = parcelas.find((x) => x.id === selectedId)
    if (p?.centroide_lat && p.centroide_lng) {
      map.flyTo({
        center: [p.centroide_lng, p.centroide_lat],
        zoom: Math.max(map.getZoom(), 15),
        duration: 800,
      })
    }
  }, [selectedId, parcelas])

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      <LeyendaNdvi />
    </>
  )
}

// Barra de color: sin ella, un mapa lleno de verdes y amarillos no dice nada.
function LeyendaNdvi() {
  const gradiente = ESCALA_NDVI.map(
    (p) => `${p.color} ${Math.round((p.valor / 0.9) * 100)}%`,
  ).join(', ')

  return (
    <div className="pointer-events-none absolute bottom-6 left-3 z-10 rounded-md bg-white/95 p-2.5 shadow-md ring-1 ring-slate-200 md:bottom-3">
      <p className="mb-1.5 text-xs font-medium text-slate-600">NDVI — vigor vegetal</p>
      <div
        className="h-2.5 w-44 rounded-sm"
        style={{ background: `linear-gradient(to right, ${gradiente})` }}
      />
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>0.0 suelo</span>
        <span>0.45</span>
        <span>0.9 dosel</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 border-t border-slate-100 pt-1.5 text-[10px] text-slate-500">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: ALERTA_COLOR.sin_datos }}
        />
        Sin medición
      </div>
    </div>
  )
}

function fitToData(
  map: mapboxgl.Map,
  polygons: GeoJSON.FeatureCollection<GeoJSON.Polygon>,
  pins: GeoJSON.FeatureCollection<GeoJSON.Point>,
) {
  const bounds = new mapboxgl.LngLatBounds()
  let has = false

  for (const f of polygons.features) {
    for (const ring of f.geometry.coordinates) {
      for (const coord of ring) {
        bounds.extend(coord as [number, number])
        has = true
      }
    }
  }
  if (!has) {
    for (const f of pins.features) {
      bounds.extend(f.geometry.coordinates as [number, number])
      has = true
    }
  }
  if (has) map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 })
}
