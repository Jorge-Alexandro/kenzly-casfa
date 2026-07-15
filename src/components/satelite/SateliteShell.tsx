'use client'

// Shell del módulo SateliteSIC. Misma anatomía que GeoSICShell (lista | mapa |
// panel) para que el coordinador no tenga que aprender otra interfaz: lo único
// que cambia es que el color significa salud de la planta, no validación.
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { UserSession } from '@/lib/types'
import type { ParcelaSateliteRow, SatStats } from '@/lib/satelite/indices'
import AppHeader from '@/components/AppHeader'
import SateliteMap from './SateliteMap'
import SatStatsBar from './SatStatsBar'
import ParcelaSatList from './ParcelaSatList'
import SatelitePanel from './SatelitePanel'
import BotonActualizar from './BotonActualizar'

type Filtro = 'todas' | 'alertas' | 'sin_datos'

interface Props {
  session: UserSession
  parcelas: ParcelaSateliteRow[]
  polygons: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  stats: SatStats
}

export default function SateliteShell({
  session,
  parcelas,
  polygons,
  stats,
}: Props) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [listaAbierta, setListaAbierta] = useState(false)

  function elegirParcela(id: string | null) {
    setSelectedId(id)
    setListaAbierta(false)
  }

  const selected = useMemo(
    () => parcelas.find((p) => p.id === selectedId) ?? null,
    [parcelas, selectedId],
  )

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    return parcelas.filter((p) => {
      if (filtro === 'alertas') {
        if (!p.alerta || p.alerta === 'normal' || p.alerta === 'sin_datos') return false
      }
      if (filtro === 'sin_datos') {
        if (!p.tiene_poligono || p.ndvi_promedio !== null) return false
      }
      if (!q) return true
      return (
        p.codigo_parcela.toLowerCase().includes(q) ||
        (p.nombre ?? '').toLowerCase().includes(q) ||
        p.productor_nombre.toLowerCase().includes(q) ||
        p.productor_codigo.toLowerCase().includes(q)
      )
    })
  }, [parcelas, query, filtro])

  // Solo tiene sentido pedirle a Copernicus las parcelas que tienen polígono.
  const idsConPoligono = useMemo(
    () => parcelas.filter((p) => p.tiene_poligono).map((p) => p.id),
    [parcelas],
  )

  const puedeActualizar = session.rol === 'admin' || session.rol === 'coordinador'

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={session.orgNombre} rol={session.rol}>
        {puedeActualizar && (
          <BotonActualizar
            parcelaIds={idsConPoligono}
            onListo={() => router.refresh()}
          />
        )}
      </AppHeader>

      <SatStatsBar stats={stats} />

      <div className="relative flex min-h-0 flex-1">
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
          <div className="space-y-2 border-b border-slate-100 p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar parcela o productor…"
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-orange-400"
            />
            <div className="flex gap-1">
              <Chip activo={filtro === 'todas'} onClick={() => setFiltro('todas')}>
                Todas
              </Chip>
              <Chip activo={filtro === 'alertas'} onClick={() => setFiltro('alertas')}>
                Alertas ({stats.alertas_activas})
              </Chip>
              <Chip activo={filtro === 'sin_datos'} onClick={() => setFiltro('sin_datos')}>
                Sin datos
              </Chip>
            </div>
          </div>
          <ParcelaSatList
            parcelas={filtradas}
            selectedId={selectedId}
            onSelect={elegirParcela}
          />
        </aside>

        <main className="relative min-w-0 flex-1">
          <button
            onClick={() => setListaAbierta(true)}
            className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md bg-white/95 px-3 py-2 text-sm font-medium text-slate-700 shadow-md ring-1 ring-slate-200 md:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            Parcelas
          </button>
          <SateliteMap
            parcelas={parcelas}
            polygons={polygons}
            selectedId={selectedId}
            onSelect={elegirParcela}
          />
        </main>

        {selected && (
          <SatelitePanel parcela={selected} onClose={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  )
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition ${
        activo
          ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
          : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}
