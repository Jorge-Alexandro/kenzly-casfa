'use client'

// Sección especial de la ficha: Estimación de cosecha (café por bandolas /
// cacao por mazorcas). Calcula EN VIVO con el mismo motor del módulo de
// Estimación (lib/agroecologia/estimacion.mjs) y guarda el resultado en las
// respuestas de la ficha (claves est_*), que salen en el PDF.
import { useState } from 'react'
import { estimarCafe, estimarCacao, CACAO_IM_DEFAULT } from '@/lib/agroecologia/estimacion.mjs'
import type { TipoFicha } from '@/lib/types'

type Metodo = 'Café' | 'Cacao'
type Vals = Record<string, unknown>

export default function EstimacionFichaSection({
  tipo,
  value,
  onResult,
}: {
  tipo: TipoFicha | null
  value: Vals
  onResult: (partial: Vals) => void
}) {
  const s = (k: string) => (value[k] == null ? '' : String(value[k]))
  const [metodo, setMetodo] = useState<Metodo>((value.est_metodo as Metodo) || (tipo === 'tropicales' ? 'Cacao' : 'Café'))
  const [promedio, setPromedio] = useState(s('est_promedio'))
  const [plantasArboles, setPlantasArboles] = useState(s('est_plantas_arboles'))
  const [superficie, setSuperficie] = useState(s('est_superficie_ha'))

  // Base de kg por quintal del café según el tipo (robusta cereza 80 / árabe pergamino 57.5).
  const kgPorQuintal = tipo === 'arabe' ? 57.5 : 80

  function commit(m: Metodo, prom: string, pa: string, sup: string) {
    const promedioN = +prom || 0
    const paN = +pa || 0
    const supN = +sup || undefined
    let factor_im: number, kg: number | null, qq: number | null
    if (m === 'Cacao') {
      const r = estimarCacao({ promedio_mazorcas: promedioN, n_arboles: paN }, {})
      factor_im = CACAO_IM_DEFAULT
      kg = r.kg_seco
      qq = null
    } else {
      const r = estimarCafe(
        { promedio_cerezo_bandola: promedioN, plantas_ha: paN, superficie_ha: supN },
        { kgPorQuintal },
      )
      factor_im = r.factor
      kg = r.kg ?? null
      qq = r.qq ?? r.qq_ha ?? null
    }
    onResult({
      est_metodo: m,
      est_promedio: promedioN || null,
      est_plantas_arboles: paN || null,
      est_superficie_ha: supN ?? null,
      est_factor_im: factor_im,
      est_kg: kg != null ? Math.round(kg * 100) / 100 : null,
      est_qq: qq != null ? Math.round(qq * 100) / 100 : null,
    })
  }

  const esCacao = metodo === 'Cacao'
  const previewKg = (() => {
    const p = +promedio || 0, pa = +plantasArboles || 0
    if (esCacao) return estimarCacao({ promedio_mazorcas: p, n_arboles: pa }, {}).kg_seco
    return estimarCafe({ promedio_cerezo_bandola: p, plantas_ha: pa, superficie_ha: +superficie || undefined }, { kgPorQuintal }).kg ?? null
  })()

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['Café', 'Cacao'] as Metodo[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMetodo(m); commit(m, promedio, plantasArboles, superficie) }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${metodo === m ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300'}`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label={esCacao ? 'Promedio de mazorcas por árbol' : 'Promedio de cerezo por bandola'}>
          <input type="number" min="0" step="0.01" value={promedio}
            onChange={(e) => { setPromedio(e.target.value); commit(metodo, e.target.value, plantasArboles, superficie) }}
            className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm" />
        </Campo>
        <Campo label={esCacao ? 'N.º de árboles productivos' : 'Plantas por hectárea'}>
          <input type="number" min="0" value={plantasArboles}
            onChange={(e) => { setPlantasArboles(e.target.value); commit(metodo, promedio, e.target.value, superficie) }}
            className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm" />
        </Campo>
        <Campo label="Superficie (ha)">
          <input type="number" min="0" step="0.01" value={superficie}
            onChange={(e) => { setSuperficie(e.target.value); commit(metodo, promedio, plantasArboles, e.target.value) }}
            className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm" />
        </Campo>
      </div>

      <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-400">Estimación calculada:</span>{' '}
        <span className="font-semibold tabular-nums text-slate-800">
          {previewKg != null ? `${previewKg.toLocaleString('es-MX', { maximumFractionDigits: 2 })} kg` : '—'}
        </span>
        {!esCacao && <span className="ml-3 text-xs text-slate-400">base {tipo === 'arabe' ? 'pergamino 57.5' : 'cereza 80'} kg/quintal</span>}
        {esCacao && <span className="ml-3 text-xs text-slate-400">IM {CACAO_IM_DEFAULT}</span>}
      </div>
      <p className="text-xs text-slate-400">
        Usa el mismo motor que el módulo de Estimación. El resultado se guarda en la ficha y sale en el PDF.
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
