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

      {/* Body: list | map | panel */}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
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
            onSelect={setSelectedId}
          />
        </aside>

        <main className="relative min-w-0 flex-1">
          <GeoSICMap
            parcelas={parcelas}
            polygons={polygons}
            selectedId={selectedId}
            onSelect={setSelectedId}
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
