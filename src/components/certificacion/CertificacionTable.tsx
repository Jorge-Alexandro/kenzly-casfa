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

export default function CertificacionTable({
  anios,
  productores,
}: {
  anios: number[]
  productores: ProductorCert[]
}) {
  const [prods, setProds] = useState(productores)
  const [filtro, setFiltro] = useState('')
  const [error, setError] = useState<string | null>(null)

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    const base = q
      ? prods.filter(
          (p) => p.nombre_completo.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q),
        )
      : prods
    return base.slice(0, 300)
  }, [prods, filtro])

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
