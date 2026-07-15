'use client'

// Tablero del programa: tarjetas de KPIs + matriz comunidad × tipo de taller.
// - Celda: clic → editar F/M; el % (=(F+M)/socios) se deriva en vivo.
// - Comunidad: clic en "✎" → editar socios/hectáreas/plantas/abono (feed KPIs).
import { useMemo, useState } from 'react'
import {
  cellKey,
  avanceCelda,
  type Matriz,
  type AvanceCell,
  type ComunidadRow,
} from '@/lib/agroecologia/programa-tipos'

export default function AgroMatriz({ matriz }: { matriz: Matriz }) {
  const { programa, tipos } = matriz

  const [coms, setComs] = useState<ComunidadRow[]>(matriz.comunidades)
  const sociosById = useMemo(() => Object.fromEntries(coms.map((c) => [c.id, c.socios])), [coms])

  const [cells, setCells] = useState<Record<string, AvanceCell>>(() => {
    const map: Record<string, AvanceCell> = {}
    for (const a of matriz.avances) map[cellKey(a.comunidad_id, a.tipo_taller_id)] = a
    return map
  })
  const [editing, setEditing] = useState<string | null>(null)
  const [editComunidad, setEditComunidad] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // El avance de una celda se deriva SIEMPRE de F/M y los socios actuales.
  const avanceDe = (c: AvanceCell | undefined, socios: number) =>
    c ? avanceCelda(c.f, c.m, socios) : 0

  const kpis = useMemo(() => {
    let asistencias = 0, f = 0, m = 0, impartidos = 0, sumAv = 0
    for (const c of coms) {
      for (const t of tipos) {
        const cell = cells[cellKey(c.id, t.id)]
        if (!cell) continue
        f += cell.f; m += cell.m; asistencias += cell.f + cell.m
        if (cell.impartido || cell.f + cell.m > 0) {
          impartidos += 1
          sumAv += avanceCelda(cell.f, cell.m, c.socios)
        }
      }
    }
    return {
      comunidades: coms.length,
      socios: coms.reduce((s, c) => s + c.socios, 0),
      talleres: impartidos,
      asistencias, f, m,
      pct: impartidos ? sumAv / impartidos : 0,
      superficie: Math.round(coms.reduce((s, c) => s + Number(c.hectareas), 0) * 100) / 100,
      plantas: coms.reduce((s, c) => s + c.plantas_entregadas, 0),
      abono: Math.round(coms.reduce((s, c) => s + Number(c.abono_ton), 0) * 1000) / 1000,
    }
  }, [cells, coms, tipos])

  async function guardarCelda(comunidadId: string, tipoId: string, f: number, m: number) {
    const socios = sociosById[comunidadId] ?? 0
    const impartido = f + m > 0
    setCells((cs) => ({
      ...cs,
      [cellKey(comunidadId, tipoId)]: {
        comunidad_id: comunidadId, tipo_taller_id: tipoId, f, m,
        avance: avanceCelda(f, m, socios), impartido,
      },
    }))
    const res = await fetch('/api/agroecologia/avance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comunidad_id: comunidadId, tipo_taller_id: tipoId, f, m, impartido }),
    })
    if (!res.ok) setError((await res.json()).error ?? 'No se pudo guardar')
  }

  async function guardarComunidad(id: string, patch: Partial<ComunidadRow>) {
    setEditComunidad(null)
    setComs((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    const res = await fetch('/api/agroecologia/comunidad', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    if (!res.ok) setError((await res.json()).error ?? 'No se pudo guardar la comunidad')
  }

  const pct = (v: number) => `${Math.round(v * 100)}%`

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi label="Comunidades" value={kpis.comunidades} />
        <Kpi label="Socios" value={kpis.socios} />
        <Kpi label="Talleres" value={kpis.talleres} />
        <Kpi label="Asistencias" value={kpis.asistencias} sub={`${kpis.f}F · ${kpis.m}M`} />
        <Kpi label="% Asistencia" value={pct(kpis.pct)} destacado />
        <Kpi label="Superficie (ha)" value={kpis.superficie} />
        <Kpi label="Plantas" value={kpis.plantas} />
        <Kpi label="Abono (t)" value={kpis.abono} />
      </div>

      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {/* Matriz */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-3 py-2.5">Comunidad</th>
              <th className="px-2 py-2.5 text-center">Socios</th>
              {tipos.map((t) => (
                <th key={t.id} className="px-2 py-2.5 text-center">{t.nombre}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {coms.map((c) => (
              <tr key={c.id} className="hover:bg-orange-50/20">
                <td className="sticky left-0 bg-white px-3 py-2 align-top">
                  {editComunidad === c.id ? (
                    <ComunidadEditor comunidad={c} onSave={(p) => guardarComunidad(c.id, p)} onCancel={() => setEditComunidad(null)} />
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="max-w-[13rem] truncate font-medium text-slate-800">{c.comunidad}</div>
                        <div className="max-w-[13rem] truncate text-xs text-slate-400">
                          {c.municipio} · {Number(c.hectareas)}ha · {c.plantas_entregadas}pl · {Number(c.abono_ton)}t
                        </div>
                      </div>
                      <button onClick={() => setEditComunidad(c.id)} className="shrink-0 text-xs text-slate-400 hover:text-orange-600" title="Editar comunidad">✎</button>
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-center tabular-nums text-slate-600">{c.socios}</td>
                {tipos.map((t) => {
                  const k = cellKey(c.id, t.id)
                  const cell = cells[k]
                  const isEditing = editing === k
                  const impartido = !!cell && (cell.impartido || cell.f + cell.m > 0)
                  const av = avanceDe(cell, c.socios)
                  return (
                    <td key={t.id} className="px-2 py-1.5 text-center">
                      {isEditing ? (
                        <CellEditor
                          f={cell?.f ?? 0}
                          m={cell?.m ?? 0}
                          onDone={(f, m) => { setEditing(null); guardarCelda(c.id, t.id, f, m) }}
                          onCancel={() => setEditing(null)}
                        />
                      ) : (
                        <button
                          onClick={() => setEditing(k)}
                          title={cell ? `${cell.f}F · ${cell.m}M de ${c.socios}` : 'Sin registrar'}
                          className={`min-w-[3rem] rounded-md px-2 py-1 text-xs font-medium ${
                            impartido ? avanceColor(av) : 'text-slate-300 ring-1 ring-slate-100'
                          }`}
                        >
                          {impartido ? pct(av) : '—'}
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        {programa.nombre} {programa.ciclo} · clic en una celda para registrar F/M · ✎ para editar socios/hectáreas/plantas/abono.
      </p>
    </div>
  )
}

function ComunidadEditor({
  comunidad, onSave, onCancel,
}: {
  comunidad: ComunidadRow
  onSave: (p: Partial<ComunidadRow>) => void
  onCancel: () => void
}) {
  const [socios, setSocios] = useState(String(comunidad.socios))
  const [ha, setHa] = useState(String(comunidad.hectareas))
  const [pl, setPl] = useState(String(comunidad.plantas_entregadas))
  const [ab, setAb] = useState(String(comunidad.abono_ton))
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-slate-700">{comunidad.comunidad}</div>
      <div className="grid grid-cols-2 gap-1">
        <Mini label="Socios" v={socios} on={setSocios} />
        <Mini label="Ha" v={ha} on={setHa} />
        <Mini label="Plantas" v={pl} on={setPl} />
        <Mini label="Abono t" v={ab} on={setAb} />
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onSave({ socios: +socios || 0, hectareas: +ha || 0, plantas_entregadas: +pl || 0, abono_ton: +ab || 0 })}
          className="rounded bg-orange-600 px-2 py-0.5 text-xs font-medium text-white"
        >Guardar</button>
        <button onClick={onCancel} className="rounded px-2 py-0.5 text-xs text-slate-500">Cancelar</button>
      </div>
    </div>
  )
}

function Mini({ label, v, on }: { label: string; v: string; on: (s: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase text-slate-400">{label}</span>
      <input type="number" min="0" step="0.01" value={v} onChange={(e) => on(e.target.value)}
        className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs" />
    </label>
  )
}

function CellEditor({
  f, m, onDone, onCancel,
}: {
  f: number; m: number
  onDone: (f: number, m: number) => void
  onCancel: () => void
}) {
  const [vf, setVf] = useState(String(f))
  const [vm, setVm] = useState(String(m))
  return (
    <div
      className="flex items-center gap-1"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onDone(+vf || 0, +vm || 0) }}
    >
      <input autoFocus type="number" min="0" value={vf} onChange={(e) => setVf(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onDone(+vf || 0, +vm || 0)}
        className="w-10 rounded border border-slate-300 px-1 py-0.5 text-xs" placeholder="F" />
      <input type="number" min="0" value={vm} onChange={(e) => setVm(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onDone(+vf || 0, +vm || 0); if (e.key === 'Escape') onCancel() }}
        className="w-10 rounded border border-slate-300 px-1 py-0.5 text-xs" placeholder="M" />
    </div>
  )
}

function avanceColor(v: number): string {
  if (v >= 0.8) return 'bg-emerald-100 text-emerald-700'
  if (v >= 0.5) return 'bg-amber-100 text-amber-700'
  return 'bg-rose-100 text-rose-700'
}

function Kpi({ label, value, sub, destacado }: { label: string; value: string | number; sub?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destacado ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${destacado ? 'text-orange-700' : 'text-slate-800'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  )
}
