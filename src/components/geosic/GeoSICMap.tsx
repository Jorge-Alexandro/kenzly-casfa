'use client'

// Mapbox GL JS map (used directly, not react-map-gl, for full layer control).
// Renders two sources:
//   1. polygons  -> fill + outline, colored by estado_validacion
//   2. pins      -> circle markers for parcelas WITHOUT a polygon (centroide null)
// Selection is driven from the parent via `selectedId`; clicks call onSelect.
import { useEffect, useRef, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
// NOTE: mapbox-gl CSS is imported globally in app/globals.css (the in-component
// import was not applied reliably, leaving the canvas at its 150px default).
import type { ParcelaGeoRow, EstadoValidacion } from '@/lib/types'
import { ESTADO_COLOR } from '@/lib/types'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

// Center on Tapachula, Chiapas (CASFA's region).
const TAPACHULA: [number, number] = [-92.26, 14.9]

// Mapbox `match` expression mapping estado_validacion -> color.
// Built from the single source of truth in types.ts so colors never drift.
function colorMatchExpression(): mapboxgl.ExpressionSpecification {
  const pairs = (Object.keys(ESTADO_COLOR) as EstadoValidacion[]).flatMap(
    (estado) => [estado, ESTADO_COLOR[estado]],
  )
  return [
    'match',
    ['get', 'estado_validacion'],
    ...pairs,
    '#64748b', // fallback gris
  ] as unknown as mapboxgl.ExpressionSpecification
}

interface Props {
  parcelas: ParcelaGeoRow[]
  polygons: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function GeoSICMap({
  parcelas,
  polygons,
  selectedId,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const loadedRef = useRef(false)
  // Keep latest onSelect without re-binding map event listeners.
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Build a point FeatureCollection for parcelas that have a centroid but
  // we still render as pins too (so a polygon's centroid shows a clickable dot).
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
            estado_validacion: p.estado_validacion,
          },
        })),
    }),
    [parcelas],
  )

  // --- Initialize the map once ---
  useEffect(() => {
    let rafId = 0
    let ro: ResizeObserver | null = null

    // Create the map ONLY when the container has a real height. In flex/absolute
    // layouts the container can still be 0px on the first frame; initializing
    // then leaves Mapbox measuring 0 and never painting. We retry on the next
    // animation frame until the layout has settled — this kills the race.
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

    // Surface any Mapbox error in the browser console (token, style, tiles…).
    map.on('error', (e) => {
      console.error('[mapbox] error:', e.error?.message ?? e)
    })

    // If the container was measured at 0px during init (flex/absolute layouts),
    // a resize once the map is ready forces a correct render.
    map.on('load', () => map.resize())

    map.on('load', () => {
      // Polygon source
      map.addSource('parcela-polygons', { type: 'geojson', data: polygons })
      map.addLayer({
        id: 'polygons-fill',
        type: 'fill',
        source: 'parcela-polygons',
        paint: {
          'fill-color': colorMatchExpression(),
          'fill-opacity': 0.4,
        },
      })
      map.addLayer({
        id: 'polygons-line',
        type: 'line',
        source: 'parcela-polygons',
        paint: {
          'line-color': colorMatchExpression(),
          'line-width': [
            'case',
            ['==', ['get', 'parcela_id'], selectedId ?? ''],
            4,
            1.5,
          ],
        },
      })

      // Pin source (centroids)
      map.addSource('parcela-pins', { type: 'geojson', data: buildPins() })
      map.addLayer({
        id: 'pins',
        type: 'circle',
        source: 'parcela-pins',
        paint: {
          'circle-radius': [
            'case',
            ['==', ['get', 'parcela_id'], selectedId ?? ''],
            9,
            6,
          ],
          'circle-color': colorMatchExpression(),
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      // Click handlers (use ref so we never stale-close over onSelect).
      const handleClick = (
        e: mapboxgl.MapMouseEvent & { features?: mapboxgl.GeoJSONFeature[] },
      ) => {
        const id = e.features?.[0]?.properties?.parcela_id as string | undefined
        if (id) onSelectRef.current(id)
      }
      map.on('click', 'polygons-fill', handleClick)
      map.on('click', 'pins', handleClick)

      for (const layer of ['polygons-fill', 'pins']) {
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

      // Keep the canvas in sync when the layout changes (panel open/close).
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

  // --- Update sources when data changes (after refresh) ---
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return
    ;(map.getSource('parcela-polygons') as mapboxgl.GeoJSONSource | undefined)?.setData(
      polygons,
    )
    ;(map.getSource('parcela-pins') as mapboxgl.GeoJSONSource | undefined)?.setData(
      buildPins(),
    )
  }, [polygons, buildPins])

  // --- Highlight + fly to the selected parcela ---
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loadedRef.current) return

    // Re-apply width/radius expressions referencing the new selectedId.
    if (map.getLayer('polygons-line')) {
      map.setPaintProperty('polygons-line', 'line-width', [
        'case',
        ['==', ['get', 'parcela_id'], selectedId ?? ''],
        4,
        1.5,
      ])
    }
    if (map.getLayer('pins')) {
      map.setPaintProperty('pins', 'circle-radius', [
        'case',
        ['==', ['get', 'parcela_id'], selectedId ?? ''],
        9,
        6,
      ])
    }

    if (!selectedId) return
    const p = parcelas.find((x) => x.id === selectedId)
    if (p?.centroide_lat && p.centroide_lng) {
      map.flyTo({
        center: [p.centroide_lng, p.centroide_lat],
        zoom: Math.max(map.getZoom(), 14),
        duration: 800,
      })
    }
  }, [selectedId, parcelas])

  return <div ref={containerRef} className="absolute inset-0" />
}

// Fit the viewport to whatever geometry exists (polygons first, else pins).
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
