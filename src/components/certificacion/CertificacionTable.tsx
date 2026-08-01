'use client'

// Padrón × años con el nivel de certificación. Cada celda se edita al hacer
// clic (select de nivel → POST). Columna de baja para dar de baja/reactivar.
import { useMemo, useState } from 'react'
import {
  NIVEL_ORDEN,
  NIVEL_LABEL,
  NIVEL_BADGE,
  TIPO_BAJA_LABEL,
  type NivelCertificacion,
  type TipoBaja,
  type ProductorCert,
} from '@/lib/certificacion/tipos'

// Grupo para contar/ordenar: el nivel VIGENTE es el del año más reciente que
// el productor tenga capturado (no un año fijo — cada quien puede llevar un
// historial distinto de años). 'baja' y 'sin_nivel' son grupos aparte porque
// no son un nivel de certificación real.
type Grupo = NivelCertificacion | 'baja' | 'sin_nivel'
// Orden que pidió el SIC: primero Orgánico, luego la transición de mayor a
// menor (T3→T2→T1), y al final lo que no cuenta como certificado todavía.
const GRUPO_ORDEN: Grupo[] = ['organico', 't3', 't2', 't1', 'nuevo', 'sin_nivel', 'baja']
const GRUPO_LABEL: Record<Grupo, string> = {
  organico: 'Orgánico', t3: 'T3', t2: 'T2', t1: 'T1', nuevo: 'Nuevo',
  sin_nivel: 'Sin nivel', baja: 'Baja',
}
const GRUPO_BADGE: Record<Grupo, string> = {
  ...NIVEL_BADGE,
  sin_nivel: 'bg-white text-slate-400 ring-1 ring-slate-200',
  baja: 'bg-rose-100 text-rose-700',
}

/** Nivel vigente de un productor: el del año con dato más reciente. */
function grupoDe(p: ProductorCert, aniosDesc: number[]): Grupo {
  if (p.baja) return 'baja'
  for (const a of aniosDesc) if (p.estatus[a]) return p.estatus[a].nivel
  return 'sin_nivel'
}

export default function CertificacionTable({
  anios,
  productores,
}: {
  anios: number[]
  productores: ProductorCert[]
}) {
  const [prods, setProds] = useState(productores)
  const [filtro, setFiltro] = useState('')
  const [grupoActivo, setGrupoActivo] = useState<Grupo | null>(null)
  const [error, setError] = useState<string | null>(null)

  // `anios` ya viene descendente desde el servidor (más reciente primero).
  const conteos = useMemo(() => {
    const c = Object.fromEntries(GRUPO_ORDEN.map((g) => [g, 0])) as Record<Grupo, number>
    for (const p of prods) c[grupoDe(p, anios)]++
    return c
  }, [prods, anios])

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    let base = q
      ? prods.filter(
          (p) => p.nombre_completo.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q),
        )
      : prods
    if (grupoActivo) base = base.filter((p) => grupoDe(p, anios) === grupoActivo)
    // Ordenado por el nivel vigente (Orgánico primero), como pidió el SIC.
    return [...base]
      .sort((a, b) => GRUPO_ORDEN.indexOf(grupoDe(a, anios)) - GRUPO_ORDEN.indexOf(grupoDe(b, anios)))
      .slice(0, 300)
  }, [prods, filtro, grupoActivo, anios])

  async function fijarNivel(pid: string, anio: number, nivel: NivelCertificacion) {
    setError(null)
    setProds((ps) =>
      ps.map((p) =>
        p.id === pid ? { ...p, estatus: { ...p.estatus, [anio]: { nivel, origen: 'ratificacion' } } } : p,
      ),
    )
    const res = await fetch('/api/certificacion/estatus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productor_id: pid, anio, nivel }),
    })
    if (!res.ok) setError((await res.json()).error ?? 'No se pudo guardar')
  }

  async function darBaja(pid: string, tipo: TipoBaja) {
    setError(null)
    setProds((ps) =>
      ps.map((p) =>
        p.id === pid ? { ...p, baja: { tipo, fecha: new Date().toISOString().slice(0, 10), motivo: null } } : p,
      ),
    )
    const res = await fetch('/api/certificacion/baja', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productor_id: pid, tipo }),
    })
    if (!res.ok) setError((await res.json()).error ?? 'No se pudo dar de baja')
  }

  async function reactivar(pid: string) {
    setProds((ps) => ps.map((p) => (p.id === pid ? { ...p, baja: null } : p)))
    await fetch(`/api/certificacion/baja?productor_id=${pid}`, { method: 'DELETE' })
  }

  return (
    <div className="space-y-3">
      {/* Conteo por estatus vigente — clic filtra la tabla. */}
      <div className="flex flex-wrap gap-2">
        {GRUPO_ORDEN.map((g) => (
          <button
            key={g}
            onClick={() => setGrupoActivo((cur) => (cur === g ? null : g))}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${GRUPO_BADGE[g]} ${
              grupoActivo === g ? 'ring-2 ring-offset-1 ring-orange-400' : 'opacity-90 hover:opacity-100'
            }`}
          >
            {GRUPO_LABEL[g]}
            <span className="tabular-nums">{conteos[g]}</span>
          </button>
        ))}
        {grupoActivo && (
          <button
            onClick={() => setGrupoActivo(null)}
            className="rounded-full px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
          >
            Quitar filtro ✕
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre o código…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="w-72 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-slate-400">
          {visibles.length} de {prods.length} · clic en una celda para fijar el nivel
        </span>
      </div>

      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Código</th>
              <th className="px-3 py-2.5">Productor</th>
              {anios.map((a) => (
                <th key={a} className="px-3 py-2.5 text-center">{a}</th>
              ))}
              <th className="px-3 py-2.5">Baja</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((p) => (
              <tr key={p.id} className={p.baja ? 'bg-rose-50/40' : 'hover:bg-orange-50/30'}>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{p.codigo}</td>
                <td className="px-3 py-2">
                  <div className="max-w-[15rem] truncate font-medium text-slate-800">{p.nombre_completo}</div>
                  <div className="max-w-[15rem] truncate text-xs text-slate-400">
                    {[p.comunidad, p.municipio].filter(Boolean).join(' · ')}
                  </div>
                </td>
                {anios.map((a) => {
                  const est = p.estatus[a]
                  return (
                    <td key={a} className="px-2 py-2 text-center">
                      {/* Select directo: funciona en tablet (sin autoFocus/onBlur). */}
                      <select
                        value={est?.nivel ?? ''}
                        onChange={(e) =>
                          e.target.value && fijarNivel(p.id, a, e.target.value as NivelCertificacion)
                        }
                        className={`cursor-pointer rounded-full border-0 px-2 py-1 text-xs font-medium outline-none ${
                          est ? NIVEL_BADGE[est.nivel] : 'bg-white text-slate-400 ring-1 ring-slate-200'
                        }`}
                      >
                        <option value="">—</option>
                        {NIVEL_ORDEN.map((n) => (
                          <option key={n} value={n}>{NIVEL_LABEL[n]}</option>
                        ))}
                      </select>
                    </td>
                  )
                })}
                <td className="px-3 py-2">
                  {p.baja ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                        {TIPO_BAJA_LABEL[p.baja.tipo]}
                      </span>
                      <button onClick={() => reactivar(p.id)} className="text-xs text-slate-500 hover:text-slate-700">↺</button>
                    </div>
                  ) : (
                    <select
                      value=""
                      onChange={(e) => e.target.value && darBaja(p.id, e.target.value as TipoBaja)}
                      className="rounded-md border border-slate-200 px-1.5 py-1 text-xs text-slate-500"
                    >
                      <option value="">Dar de baja…</option>
                      {(Object.keys(TIPO_BAJA_LABEL) as TipoBaja[]).map((t) => (
                        <option key={t} value={t}>{TIPO_BAJA_LABEL[t]}</option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
