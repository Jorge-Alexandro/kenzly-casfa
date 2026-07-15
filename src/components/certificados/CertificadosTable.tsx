'use client'

// Matriz programa × esquema con la fecha de vencimiento y su nivel de alerta.
// Clic en una celda para editar la fecha; el estado del trámite se edita por fila.
import { useMemo, useState } from 'react'
import {
  ESQUEMAS,
  nivelAlerta,
  textoDias,
  diasRestantes,
  ALERTA_LABEL,
  ALERTA_BADGE,
  type Certificado,
  type NivelAlerta,
} from '@/lib/certificados/tipos'

export default function CertificadosTable({ certificados }: { certificados: Certificado[] }) {
  const [items, setItems] = useState(certificados)
  const [editando, setEditando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Agrupa por programa, conservando el orden de aparición.
  const programas = useMemo(() => {
    const map = new Map<string, Certificado[]>()
    for (const c of items) {
      if (!map.has(c.programa)) map.set(c.programa, [])
      map.get(c.programa)!.push(c)
    }
    return Array.from(map.entries())
  }, [items])

  // Resumen de alertas.
  const resumen = useMemo(() => {
    const r: Record<NivelAlerta, number> = { vencido: 0, critico: 0, proximo: 0, vigente: 0, sin_fecha: 0 }
    for (const c of items) r[nivelAlerta(c.fecha_vencimiento)] += 1
    return r
  }, [items])

  async function guardar(id: string, patch: Partial<Certificado>) {
    setEditando(null)
    setItems((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    const res = await fetch('/api/certificados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    if (!res.ok) setError((await res.json()).error ?? 'No se pudo guardar')
  }

  const celda = (c: Certificado | undefined) => {
    if (!c) return <span className="text-slate-300">—</span>
    const nivel = nivelAlerta(c.fecha_vencimiento)
    return (
      <button
        onClick={() => setEditando(c.id)}
        className={`w-full rounded-md px-2 py-1 text-xs font-medium ${ALERTA_BADGE[nivel]}`}
        title={`${ALERTA_LABEL[nivel]} · ${textoDias(c.fecha_vencimiento)}`}
      >
        <div className="tabular-nums">{c.fecha_vencimiento ?? '—'}</div>
        <div className="text-[10px] font-normal opacity-80">{textoDias(c.fecha_vencimiento)}</div>
      </button>
    )
  }

  return (
    <div className="space-y-4">
      {/* Alertas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Vencidos" value={resumen.vencido} tono="rose" />
        <Tile label="Por vencer (≤30 d)" value={resumen.critico} tono="orange" />
        <Tile label="Próximos (≤90 d)" value={resumen.proximo} tono="amber" />
        <Tile label="Vigentes" value={resumen.vigente} tono="emerald" />
      </div>

      {(resumen.vencido > 0 || resumen.critico > 0) && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <b>Atención:</b> {resumen.vencido > 0 && `${resumen.vencido} certificado(s) VENCIDO(S)`}
          {resumen.vencido > 0 && resumen.critico > 0 && ' · '}
          {resumen.critico > 0 && `${resumen.critico} vence(n) en ≤30 días`}. Revisa el trámite con la certificadora.
        </div>
      )}

      {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {/* Matriz */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Programa</th>
              {ESQUEMAS.map((e) => (
                <th key={e} className="px-2 py-2.5 text-center">{e}</th>
              ))}
              <th className="px-3 py-2.5">Estado del trámite</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {programas.map(([programa, certs]) => {
              const fila = certs[0]
              return (
                <tr key={programa} className="align-top hover:bg-orange-50/20">
                  <td className="px-3 py-2 font-medium text-slate-800">{programa}</td>
                  {ESQUEMAS.map((e) => {
                    const c = certs.find((x) => x.esquema === e)
                    const isEditing = c && editando === c.id
                    return (
                      <td key={e} className="px-2 py-2 text-center">
                        {isEditing ? (
                          <input
                            autoFocus
                            type="date"
                            defaultValue={c.fecha_vencimiento ?? ''}
                            onBlur={(ev) => guardar(c.id, { fecha_vencimiento: ev.target.value })}
                            className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
                          />
                        ) : (
                          celda(c)
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      defaultValue={fila?.estado ?? ''}
                      placeholder="Estado del trámite…"
                      onBlur={(ev) => {
                        // El estado es del programa: se aplica a sus 3 esquemas.
                        for (const c of certs) {
                          if ((c.estado ?? '') !== ev.target.value) guardar(c.id, { estado: ev.target.value })
                        }
                      }}
                      className="w-full min-w-[16rem] rounded border border-slate-200 px-2 py-1 text-xs text-slate-600"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        Clic en una fecha para editarla. El estado del trámite se guarda para los 3 esquemas del programa.
      </p>
    </div>
  )
}

function Tile({ label, value, tono }: { label: string; value: number; tono: string }) {
  const map: Record<string, string> = {
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }
  return (
    <div className={`rounded-xl border p-3 ${value > 0 ? map[tono] : 'border-slate-200 bg-white text-slate-400'}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}
