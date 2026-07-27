'use client'

// Selecciona una parcela EMPEZANDO por el productor (no por la parcela).
//
// El SIC piensa por productor: "voy a hacer la bitácora de Don Alejo", no "voy
// a hacer la bitácora de la parcela CR089001-A". Antes había que buscar por
// nombre/código de parcela, que casi nadie recuerda. Aquí se busca al productor
// y luego se elige su parcela (si solo tiene una, se toma sola).
import { useMemo, useState } from 'react'
import { codigoCorto } from '@/lib/format'
import type { ParcelaLite } from '@/lib/types'

export interface ProductorMin {
  id: string
  nombre_completo: string
  codigo: string
}

export default function ProductorParcelaBuscador({
  parcelas,
  productores,
  value,
  onChange,
}: {
  parcelas: ParcelaLite[]
  productores: ProductorMin[]
  value: string
  onChange: (parcelaId: string) => void
}) {
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  // Productor en el que ya entramos para ver sus parcelas.
  const [prodId, setProdId] = useState<string | null>(null)

  // Solo productores que tienen al menos una parcela (si no, no hay qué capturar).
  const conParcela = useMemo(() => {
    const ids = new Set(parcelas.map((p) => p.productor_id))
    return productores.filter((p) => ids.has(p.id))
  }, [parcelas, productores])

  const seleccionada = parcelas.find((p) => p.id === value) ?? null
  const prodDeSeleccion = seleccionada
    ? productores.find((p) => p.id === seleccionada.productor_id)
    : null

  const query = q.trim().toLowerCase()
  const prodsFiltrados = query
    ? conParcela.filter(
        (p) =>
          p.nombre_completo.toLowerCase().includes(query) ||
          p.codigo.toLowerCase().includes(query),
      )
    : conParcela
  const parcelasDeProd = prodId
    ? parcelas.filter((p) => p.productor_id === prodId)
    : []

  function elegirProductor(id: string) {
    const suyas = parcelas.filter((p) => p.productor_id === id)
    if (suyas.length === 1) {
      // Con una sola parcela no hay nada que preguntar.
      onChange(suyas[0].id)
      cerrar()
    } else {
      setProdId(id)
    }
  }
  function cerrar() {
    setAbierto(false)
    setProdId(null)
    setQ('')
  }

  const etiqueta = seleccionada
    ? `${prodDeSeleccion?.nombre_completo ?? 'Productor'} · ${codigoCorto(seleccionada.codigo_parcela, seleccionada.nombre)}`
    : ''

  return (
    <div className="relative">
      <input
        value={abierto ? q : etiqueta || q}
        onChange={(e) => { setQ(e.target.value); setAbierto(true); setProdId(null) }}
        onFocus={() => { setQ(''); setAbierto(true); setProdId(null) }}
        placeholder="Buscar productor por nombre o código…"
        className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-sm outline-none focus:border-orange-400"
      />
      {abierto && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {/* Paso 2: parcelas del productor elegido */}
          {prodId ? (
            <>
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => setProdId(null)}
                  className="text-xs text-slate-600 hover:text-slate-800"
                >
                  ← productores
                </button>
                <span className="truncate text-xs font-medium text-slate-700">
                  {conParcela.find((p) => p.id === prodId)?.nombre_completo}
                </span>
              </div>
              {parcelasDeProd.map((p) => {
                const cod = codigoCorto(p.codigo_parcela, p.nombre)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { onChange(p.id); cerrar() }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-orange-50"
                  >
                    <span className="font-medium text-slate-800">{p.nombre || cod}</span>
                    <span className="ml-2 text-xs text-slate-400">{cod}</span>
                  </button>
                )
              })}
            </>
          ) : (
            /* Paso 1: productores */
            <>
              {prodsFiltrados.slice(0, 80).map((p) => {
                const n = parcelas.filter((x) => x.productor_id === p.id).length
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => elegirProductor(p.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-orange-50"
                  >
                    <span className="font-medium text-slate-800">{p.nombre_completo}</span>
                    <span className="ml-2 shrink-0 text-xs text-slate-400">
                      {p.codigo} · {n} parcela{n === 1 ? '' : 's'}
                    </span>
                  </button>
                )
              })}
              {prodsFiltrados.length === 0 && (
                <p className="px-3 py-2 text-sm text-slate-400">Sin coincidencias</p>
              )}
              {prodsFiltrados.length > 80 && (
                <p className="px-3 py-1.5 text-xs text-slate-400">
                  Mostrando 80 de {prodsFiltrados.length}. Escribe para filtrar.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
