'use client'

// Selector de parcela que navega al historial de la parcela elegida.
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { ParcelaLite } from '@/lib/types'
import { codigoCorto } from '@/lib/format'

export default function ParcelaPicker({ parcelas }: { parcelas: ParcelaLite[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')

  const lista = useMemo(() => {
    const s = q.trim().toLowerCase()
    return parcelas
      .filter(
        (p) =>
          !s ||
          (p.nombre ?? '').toLowerCase().includes(s) ||
          p.codigo_parcela.toLowerCase().includes(s),
      )
      .slice(0, 100)
  }, [parcelas, q])

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="mb-3 text-base font-semibold text-slate-800">
        Elige una parcela para su historial
      </h1>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar parcela o código…"
        className="mb-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
      />
      <div className="max-h-[60vh] overflow-y-auto rounded-md border border-slate-100">
        {lista.map((p) => {
          const cod = codigoCorto(p.codigo_parcela, p.nombre)
          return (
            <button
              key={p.id}
              onClick={() => router.push(`/historial/${p.id}`)}
              className="flex w-full items-center justify-between border-b border-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-800">{p.nombre || cod}</span>
              <span className="text-xs text-slate-400">{cod}</span>
            </button>
          )
        })}
        {lista.length === 0 && (
          <p className="p-4 text-sm text-slate-400">Sin coincidencias.</p>
        )}
      </div>
    </div>
  )
}
