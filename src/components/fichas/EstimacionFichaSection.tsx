'use client'

// Estimación de cosecha DENTRO de la ficha, con la captura detallada de las
// boletas de CASFA (no se pide el promedio: se calcula solo):
//   - Café : rejilla plantas × bandolas (cuenta de cerezos) → promedio/bandola.
//   - Cacao: tabla por parámetro (nº de árboles × mazorcas/árbol) → promedio.
// Calcula EN VIVO con el motor de estimación y guarda est_* en las respuestas.
import { useMemo, useState } from 'react'
import { estimarCafe, estimarCacao, CACAO_IM_DEFAULT } from '@/lib/agroecologia/estimacion.mjs'
import type { TipoFicha } from '@/lib/types'

type Metodo = 'Café' | 'Cacao'
type Vals = Record<string, unknown>

const N_PLANTAS = 10
const N_BANDOLAS = 10
// Parámetros de la boleta de cacao (rango de mazorcas → conteo representativo).
const CACAO_RANGOS = [
  { label: '0', mazorcas: 0 },
  { label: '10 - 20', mazorcas: 15 },
  { label: '20 - 30', mazorcas: 25 },
  { label: '30 - 40', mazorcas: 35 },
  { label: 'Mayor a 40', mazorcas: 45 },
]

function toGrid(v: unknown): string[][] {
  if (Array.isArray(v) && v.length === N_PLANTAS) return v as string[][]
  return Array.from({ length: N_PLANTAS }, () => Array.from({ length: N_BANDOLAS }, () => ''))
}
function toMuestras(v: unknown): { arboles: string; mazorcas: string }[] {
  if (Array.isArray(v) && v.length === CACAO_RANGOS.length) return v as { arboles: string; mazorcas: string }[]
  return CACAO_RANGOS.map((r) => ({ arboles: '', mazorcas: String(r.mazorcas) }))
}

export default function EstimacionFichaSection({
  tipo,
  value,
  onResult,
}: {
  tipo: TipoFicha | null
  value: Vals
  onResult: (partial: Vals) => void
}) {
  const [metodo, setMetodo] = useState<Metodo>(
    (value.est_metodo as Metodo) || (tipo === 'tropicales' ? 'Cacao' : 'Café'),
  )
  // Café
  const [grid, setGrid] = useState<string[][]>(toGrid(value.est_cafe_grid))
  const [plantasHa, setPlantasHa] = useState(value.est_plantas_ha == null ? '' : String(value.est_plantas_ha))
  const [superficie, setSuperficie] = useState(value.est_superficie_ha == null ? '' : String(value.est_superficie_ha))
  // Cacao
  const [muestras, setMuestras] = useState(toMuestras(value.est_cacao_muestras))
  const [nArboles, setNArboles] = useState(value.est_n_arboles == null ? '' : String(value.est_n_arboles))

  const kgPorQuintal = tipo === 'arabe' ? 57.5 : 80
  const esCacao = metodo === 'Cacao'

  // --- Promedio calculado a partir de las mediciones ---
  const promedioCafe = useMemo(() => {
    let suma = 0, n = 0
    for (const fila of grid) for (const c of fila) {
      if (c !== '' && Number.isFinite(+c)) { suma += +c; n++ }
    }
    return n > 0 ? suma / n : 0
  }, [grid])

  const promedioCacao = useMemo(() => {
    let mz = 0, ar = 0
    for (const m of muestras) {
      const b = +m.arboles || 0, c = +m.mazorcas || 0
      mz += b * c; ar += b
    }
    return ar > 0 ? mz / ar : 0
  }, [muestras])

  // Promedios por planta (café) para la columna Σ/10.
  const promPorPlanta = grid.map((fila) => {
    const vals = fila.filter((c) => c !== '' && Number.isFinite(+c)).map((c) => +c)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  })

  // --- Resultado en vivo ---
  const resultado = useMemo(() => {
    if (esCacao) {
      const r = estimarCacao({ promedio_mazorcas: promedioCacao, n_arboles: +nArboles || 0 }, {})
      return { promedio: promedioCacao, kg: (r.kg_seco ?? null) as number | null, qq: null as number | null, factor_im: CACAO_IM_DEFAULT }
    }
    const r = estimarCafe(
      { promedio_cerezo_bandola: promedioCafe, plantas_ha: +plantasHa || 0, superficie_ha: +superficie || undefined },
      { kgPorQuintal },
    )
    return { promedio: promedioCafe, kg: (r.kg ?? null) as number | null, qq: (r.qq ?? r.qq_ha ?? null) as number | null, factor_im: r.factor as number }
  }, [esCacao, promedioCafe, promedioCacao, plantasHa, superficie, nArboles, kgPorQuintal])

  // Persiste en las respuestas de la ficha (mediciones + resultado).
  function guardar(patch: Partial<Vals> = {}) {
    onResult({
      est_metodo: metodo,
      est_cafe_grid: grid,
      est_plantas_ha: +plantasHa || null,
      est_superficie_ha: +superficie || null,
      est_cacao_muestras: muestras,
      est_n_arboles: +nArboles || null,
      // Campo combinado que muestra el reporte (plantas/ha en café · árboles en cacao).
      est_plantas_arboles: (esCacao ? +nArboles : +plantasHa) || null,
      est_promedio: resultado.promedio ? Math.round(resultado.promedio * 100) / 100 : null,
      est_factor_im: resultado.factor_im,
      est_kg: resultado.kg != null ? Math.round(resultado.kg * 100) / 100 : null,
      est_qq: resultado.qq != null ? Math.round(resultado.qq * 100) / 100 : null,
      ...patch,
    })
  }

  function setCelda(pi: number, bi: number, v: string) {
    setGrid((g) => {
      const ng = g.map((f) => [...f])
      ng[pi][bi] = v
      return ng
    })
  }

  return (
    <div className="space-y-4" onBlur={() => guardar()}>
      <div className="flex gap-2">
        {(['Café', 'Cacao'] as Metodo[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMetodo(m); setTimeout(() => guardar({ est_metodo: m }), 0) }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${metodo === m ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300'}`}
          >
            {m}
          </button>
        ))}
      </div>

      {!esCacao ? (
        <>
          <p className="text-xs text-slate-500">
            Cuenta los cerezos por bandola (10 bandolas en cada una de 10 plantas). El promedio se calcula solo.
          </p>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="text-center text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-1.5 py-1 font-medium">Planta \ Bandola</th>
                  {Array.from({ length: N_BANDOLAS }, (_, i) => (
                    <th key={i} className="px-1 py-1 font-medium">{i + 1}</th>
                  ))}
                  <th className="px-1.5 py-1 font-medium text-orange-600">Σ/10</th>
                </tr>
              </thead>
              <tbody>
                {grid.map((fila, pi) => (
                  <tr key={pi} className="border-t border-slate-100">
                    <td className="px-1.5 py-1 font-medium text-slate-500">{pi + 1}</td>
                    {fila.map((c, bi) => (
                      <td key={bi} className="p-0.5">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={c}
                          onChange={(e) => setCelda(pi, bi, e.target.value)}
                          className="w-10 rounded border border-slate-200 px-1 py-1 text-center outline-none focus:border-orange-400"
                        />
                      </td>
                    ))}
                    <td className="px-1.5 py-1 font-medium tabular-nums text-slate-700">
                      {promPorPlanta[pi] != null ? promPorPlanta[pi]!.toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo label="Promedio cerezo/bandola (auto)">
              <input readOnly value={promedioCafe ? promedioCafe.toFixed(2) : '—'} className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-semibold" />
            </Campo>
            <Campo label="N.º de plantas por hectárea">
              <input type="number" min="0" value={plantasHa} onChange={(e) => setPlantasHa(e.target.value)} className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm" />
            </Campo>
            <Campo label="Superficie (ha)">
              <input type="number" min="0" step="0.01" value={superficie} onChange={(e) => setSuperficie(e.target.value)} className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm" />
            </Campo>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Muestrea 10 árboles productivos; por cada rango de mazorcas indica cuántos árboles y las mazorcas/árbol. El promedio se calcula solo.
          </p>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-1 font-medium">Parámetro (mazorcas)</th>
                  <th className="px-2 py-1 font-medium">N.º árboles</th>
                  <th className="px-2 py-1 font-medium">Mazorcas/árbol</th>
                  <th className="px-2 py-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {muestras.map((m, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1 font-medium text-slate-600">{CACAO_RANGOS[i].label}</td>
                    <td className="px-2 py-1">
                      <input type="number" min="0" value={m.arboles}
                        onChange={(e) => setMuestras((ms) => ms.map((x, j) => (j === i ? { ...x, arboles: e.target.value } : x)))}
                        className="w-20 rounded border border-slate-200 px-1.5 py-1 outline-none focus:border-orange-400" />
                    </td>
                    <td className="px-2 py-1">
                      <input type="number" min="0" value={m.mazorcas}
                        onChange={(e) => setMuestras((ms) => ms.map((x, j) => (j === i ? { ...x, mazorcas: e.target.value } : x)))}
                        className="w-20 rounded border border-slate-200 px-1.5 py-1 outline-none focus:border-orange-400" />
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-slate-600">
                      {((+m.arboles || 0) * (+m.mazorcas || 0)) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Promedio mazorcas/árbol (auto)">
              <input readOnly value={promedioCacao ? promedioCacao.toFixed(2) : '—'} className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-semibold" />
            </Campo>
            <Campo label="N.º total de árboles productivos de la parcela">
              <input type="number" min="0" value={nArboles} onChange={(e) => setNArboles(e.target.value)} className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm" />
            </Campo>
          </div>
        </>
      )}

      <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-400">Estimación calculada:</span>{' '}
        <span className="font-semibold tabular-nums text-slate-800">
          {resultado.kg != null ? `${resultado.kg.toLocaleString('es-MX', { maximumFractionDigits: 2 })} kg` : '—'}
        </span>
        {resultado.qq != null && (
          <span className="ml-2 text-slate-600">· {resultado.qq.toLocaleString('es-MX', { maximumFractionDigits: 2 })} qq</span>
        )}
        <span className="ml-3 text-xs text-slate-400">
          {esCacao ? `IM ${CACAO_IM_DEFAULT}` : `factor ${resultado.factor_im} · base ${tipo === 'arabe' ? 'pergamino 57.5' : 'cereza 80'} kg/qq`}
        </span>
      </div>
      <p className="text-xs text-slate-400">
        Las mediciones y el resultado se guardan en la ficha y salen en el PDF.
      </p>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}
