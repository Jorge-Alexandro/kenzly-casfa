'use client'

// Client shell that wires together the map, the stats bar, the parcela list
// and the detail panel. It owns the shared UI state (which parcela is selected,
// is the upload modal open) and passes server-fetched data down as props.
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { ParcelaGeoRow, GeoStats, UserSession } from '@/lib/types'
import GeoSICMap from './GeoSICMap'
import GeoStatsBar from './GeoStatsBar'
import ParcelaList from './ParcelaList'
import ParcelaPanel from './ParcelaPanel'
import KmlUploadModal from './KmlUploadModal'
import AppHeader from '@/components/AppHeader'

interface Props {
  session: UserSession
  parcelas: ParcelaGeoRow[]
  polygons: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  stats: GeoStats
}

export default function GeoSICShell({
  session,
  parcelas,
  polygons,
  stats,
}: Props) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [listaAbierta, setListaAbierta] = useState(false) // drawer de lista en celular

  // Al elegir una parcela en celular, cerramos el cajón de la lista para ver
  // el mapa y el panel de detalle.
  function elegirParcela(id: string | null) {
    setSelectedId(id)
    setListaAbierta(false)
  }

  const selected = useMemo(
    () => parcelas.find((p) => p.id === selectedId) ?? null,
    [parcelas, selectedId],
  )

  // Filter the list by free-text on parcela / productor name or code.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return parcelas
    return parcelas.filter(
      (p) =>
        p.codigo_parcela.toLowerCase().includes(q) ||
        (p.nombre ?? '').toLowerCase().includes(q) ||
        p.productor_nombre.toLowerCase().includes(q) ||
        p.productor_codigo.toLowerCase().includes(q),
    )
  }, [parcelas, query])

  // Refresh server data after an upload or validation changes the DB.
  function refresh() {
    router.refresh()
  }

  const puedeValidar = session.rol === 'admin' || session.rol === 'coordinador'

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      {/* Top bar (shared) with the module-specific upload action */}
      <AppHeader orgNombre={session.orgNombre}>
        <button
          onClick={() => setUploadOpen(true)}
          className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600"
        >
          + Subir KML/KMZ
        </button>
      </AppHeader>

      {/* Stats bar */}
      <GeoStatsBar stats={stats} />

      {/* Body: list | map | panel  (en celular la lista y el panel son overlays) */}
      <div className="relative flex min-h-0 flex-1">
        {/* Fondo oscuro al abrir la lista en celular */}
        {listaAbierta && (
          <button
            aria-label="Cerrar lista"
            onClick={() => setListaAbierta(false)}
            className="absolute inset-0 z-20 bg-black/30 md:hidden"
          />
        )}

        <aside
          className={`absolute inset-y-0 left-0 z-30 flex w-72 max-w-[85%] shrink-0 flex-col border-r border-slate-200 bg-white transition-transform md:static md:z-auto md:max-w-none md:translate-x-0 ${
            listaAbierta ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="border-b border-slate-100 p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar parcela o productor…"
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400"
            />
          </div>
          <ParcelaList
            parcelas={filtered}
            selectedId={selectedId}
            onSelect={elegirParcela}
          />
        </aside>

        <main className="relative min-w-0 flex-1">
          {/* Botón para abrir la lista — solo en celular */}
          <button
            onClick={() => setListaAbierta(true)}
            className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md bg-white/95 px-3 py-2 text-sm font-medium text-slate-700 shadow-md ring-1 ring-slate-200 md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            Parcelas
          </button>
          <GeoSICMap
            parcelas={parcelas}
            polygons={polygons}
            selectedId={selectedId}
            onSelect={elegirParcela}
          />
        </main>

        {selected && (
          <ParcelaPanel
            parcela={selected}
            puedeValidar={puedeValidar}
            onClose={() => setSelectedId(null)}
            onChanged={refresh}
          />
        )}
      </div>

      {uploadOpen && (
        <KmlUploadModal
          parcelas={parcelas}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}
