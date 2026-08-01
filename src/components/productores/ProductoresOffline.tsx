'use client'

// Directorio de productores para consultar SIN señal: el padrón completo
// (todos, no solo los de la ficha en curso) ya se cachea en el dispositivo
// cada vez que la app abre con internet — aquí solo se muestra. Sirve para
// resolver en el campo "¿este productor ya existe?" o "¿de qué comunidad es?"
// antes de decidir si hace falta dar de alta uno nuevo.
import { useMemo, useState } from 'react'
import { codigoCorto } from '@/lib/format'
import { NIVEL_CERT_LABEL } from '@/lib/types'
import type { ProductorLite, ParcelaLite } from '@/lib/types'

const CULTIVO_LABEL: Record<string, string> = {
  cafe: 'Café',
  tropical: 'Tropical',
  mixto: 'Mixto',
}

export default function ProductoresOffline({
  productores,
  parcelas,
}: {
  productores: ProductorLite[]
  parcelas: ParcelaLite[]
}) {
  const [q, setQ] = useState('')
  const [seleccionado, setSeleccionado] = useState<ProductorLite | null>(null)

  const filtrados = useMemo(() => {
    const query = q.trim().toLowerCase()
    const base = query
      ? productores.filter(
          (p) =>
            p.nombre_completo.toLowerCase().includes(query) ||
            p.codigo.toLowerCase().includes(query) ||
            (p.comunidad ?? '').toLowerCase().includes(query),
        )
      : productores
    return base.slice(0, 150)
  }, [productores, q])

  if (seleccionado) {
    const suyas = parcelas.filter((p) => p.productor_id === seleccionado.id)
    return (
      <div className="mx-auto max-w-xl p-4">
        <button
          onClick={() => setSeleccionado(null)}
          className="mb-3 text-sm text-slate-500 hover:text-slate-700"
        >
          ← Volver a la lista
        </button>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-800">
            {seleccionado.nombre_completo}
          </h2>
          <p className="text-sm text-slate-500">{seleccionado.codigo}</p>

          <dl className="mt-3 space-y-1.5 text-sm">
            <Fila k="Comunidad" v={seleccionado.comunidad} />
            <Fila k="Municipio" v={seleccionado.municipio} />
            <Fila
              k="Cultivo"
              v={
                seleccionado.tipo_productor === 'cafe'
                  ? `Café${seleccionado.cafe_variedad ? ` · ${seleccionado.cafe_variedad === 'arabe' ? 'Arábiga' : 'Robusta'}` : ''}`
                  : CULTIVO_LABEL[seleccionado.tipo_productor] ?? seleccionado.tipo_productor
              }
            />
            <Fila
              k="Nivel de certificación"
              v={
                seleccionado.estatus_nivel
                  ? `${NIVEL_CERT_LABEL[seleccionado.estatus_nivel]}${seleccionado.estatus_anio ? ` (${seleccionado.estatus_anio})` : ''}`
                  : null
              }
            />
          </dl>

          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Parcelas ({suyas.length})
            </p>
            {suyas.length === 0 ? (
              <p className="text-sm text-slate-400">Sin parcelas registradas.</p>
            ) : (
              <ul className="space-y-1">
                {suyas.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">
                      {p.nombre || codigoCorto(p.codigo_parcela, p.nombre)}
                      <span className="ml-1.5 text-xs text-slate-400">
                        {codigoCorto(p.codigo_parcela, p.nombre)}
                      </span>
                    </span>
                    <span className="text-slate-500">
                      {p.superficie_declarada_ha != null
                        ? `${Number(p.superficie_declarada_ha).toFixed(2)} ha`
                        : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl p-4">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre, código o comunidad…"
        className="w-full rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"
      />
      <p className="mt-2 text-xs text-slate-400">
        {productores.length} productores descargados en este dispositivo.
        {filtrados.length < productores.length && ` Mostrando ${filtrados.length}.`}
      </p>

      <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100 bg-white">
        {filtrados.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => setSeleccionado(p)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-orange-50"
            >
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  {p.nombre_completo}
                </span>
                <span className="block text-xs text-slate-400">
                  {[p.codigo, p.comunidad].filter(Boolean).join(' · ')}
                </span>
              </span>
              {p.estatus_nivel && (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {NIVEL_CERT_LABEL[p.estatus_nivel]}
                </span>
              )}
            </button>
          </li>
        ))}
        {filtrados.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-slate-400">Sin coincidencias.</li>
        )}
      </ul>
    </div>
  )
}

function Fila({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium text-slate-800">{v || '—'}</dd>
    </div>
  )
}
