'use client'

// Captura de estimación de cosecha (boletas café y cacao) con cálculo EN VIVO
// usando el mismo motor del servidor (estimacion.mjs). Guarda calculado + valor
// del productor + valor final negociado.
import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { estimarCafe, estimarCacao } from '@/lib/agroecologia/estimacion.mjs'
import { METODO_LABEL, type EstimacionMetodo, type Reglas, type ParcelaLite } from '@/lib/agroecologia/tipos'
import type { ProductorLite } from '@/lib/acopio/tipos'

type Bin = { mazorcas: string; arboles: string }

export default function EstimacionForm({
  reglas,
  productores,
}: {
  reglas: Reglas
  productores: ProductorLite[]
}) {
  const router = useRouter()
  const [metodo, setMetodo] = useState<EstimacionMetodo>('cafe')
  const [busqueda, setBusqueda] = useState('')
  const [productorId, setProductorId] = useState('')
  const [parcelas, setParcelas] = useState<ParcelaLite[]>([])
  const [parcelaId, setParcelaId] = useState('')
  const [ciclo, setCiclo] = useState('2025-2026')
  const [cultivoCafe, setCultivoCafe] = useState('cafe_robusta')
  const [superficie, setSuperficie] = useState('')

  // café
  const [promedioBandola, setPromedioBandola] = useState('')
  const [plantasHa, setPlantasHa] = useState('')
  // cacao
  const [nArboles, setNArboles] = useState('')
  const [bins, setBins] = useState<Bin[]>([{ mazorcas: '', arboles: '' }])

  const [valorProductor, setValorProductor] = useState('')
  const [valorFinal, setValorFinal] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const proveedores = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const base = q
      ? productores.filter(
          (p) => p.nombre_completo.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q),
        )
      : productores
    return base.slice(0, 50)
  }, [productores, busqueda])

  // Carga parcelas al elegir productor.
  useEffect(() => {
    if (!productorId) {
      setParcelas([])
      setParcelaId('')
      return
    }
    fetch(`/api/agroecologia/parcelas?productor_id=${productorId}`)
      .then((r) => r.json())
      .then((d) => setParcelas(d.parcelas ?? []))
      .catch(() => setParcelas([]))
  }, [productorId])

  // Prefill de superficie desde la parcela.
  useEffect(() => {
    const p = parcelas.find((x) => x.id === parcelaId)
    if (p?.superficie_ha != null) setSuperficie(String(p.superficie_ha))
  }, [parcelaId, parcelas])

  // Factores del café con null→Infinity para el motor.
  const factores = useMemo(
    () => reglas.cafe.factores.map((f) => ({ hasta: f.hasta == null ? Infinity : f.hasta, factor: f.factor })),
    [reglas],
  )

  const prev = useMemo(() => {
    const ha = +superficie || undefined
    if (metodo === 'cafe') {
      const kgPorQuintal = reglas.cafe.kg_por_quintal[cultivoCafe] ?? reglas.cafe.oro_kg
      return estimarCafe(
        { promedio_cerezo_bandola: +promedioBandola || 0, plantas_ha: +plantasHa || 0, superficie_ha: ha },
        { factores, constante: reglas.cafe.constante, kgPorQuintal },
      )
    }
    const muestras = bins
      .filter((b) => b.mazorcas !== '' && b.arboles !== '')
      .map((b) => ({ mazorcas: +b.mazorcas, arboles: +b.arboles }))
    return estimarCacao({ muestras, n_arboles: +nArboles || 0 }, { im: reglas.cacao.im })
  }, [metodo, promedioBandola, plantasHa, superficie, bins, nArboles, cultivoCafe, factores, reglas])

  const kgCalculado = metodo === 'cafe' ? (prev as ReturnType<typeof estimarCafe>).kg ?? null
                                        : (prev as ReturnType<typeof estimarCacao>).kg_seco

  async function guardar() {
    setError(null)
    if (!parcelaId) return setError('Selecciona la parcela.')
    setGuardando(true)
    try {
      const base = {
        parcela_id: parcelaId,
        ciclo,
        cultivo: metodo === 'cafe' ? cultivoCafe : 'cacao',
        metodo,
        superficie_ha: +superficie || null,
        valor_productor_kg: valorProductor ? +valorProductor : null,
        valor_final_kg: valorFinal ? +valorFinal : null,
      }
      const payload =
        metodo === 'cafe'
          ? { ...base, promedio_cerezo_bandola: +promedioBandola || 0, plantas_ha: +plantasHa || 0 }
          : {
              ...base,
              n_arboles: +nArboles || 0,
              muestras: bins
                .filter((b) => b.mazorcas !== '' && b.arboles !== '')
                .map((b) => ({ mazorcas: +b.mazorcas, arboles: +b.arboles })),
            }
      const res = await fetch('/api/agroecologia/estimaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      router.push('/estimacion')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800">Nueva estimación de cosecha</h1>
        <Link href="/estimacion" className="text-sm text-slate-500 hover:text-slate-700">← Volver</Link>
      </div>

      {/* Método */}
      <div className="flex gap-2">
        {(['cafe', 'cacao'] as EstimacionMetodo[]).map((m) => (
          <button
            key={m}
            onClick={() => setMetodo(m)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              metodo === m ? 'bg-orange-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-300'
            }`}
          >
            {METODO_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <Campo label="Productor (padrón)">
          <input
            type="text"
            placeholder="Buscar por nombre o código…"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setProductorId('') }}
            className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={productorId}
            onChange={(e) => setProductorId(e.target.value)}
            size={5}
            className="w-full rounded-md border border-slate-300 px-1 py-1 text-sm"
          >
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.codigo} — {p.nombre_completo}</option>
            ))}
          </select>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Parcela">
            <select
              value={parcelaId}
              onChange={(e) => setParcelaId(e.target.value)}
              disabled={parcelas.length === 0}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            >
              <option value="">{parcelas.length ? '—' : 'Elige un productor primero'}</option>
              {parcelas.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre ?? p.codigo_parcela}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Ciclo">
            <input value={ciclo} onChange={(e) => setCiclo(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {metodo === 'cafe' && (
            <Campo label="Cultivo">
              <select value={cultivoCafe} onChange={(e) => setCultivoCafe(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="cafe_robusta">Café robusta</option>
                <option value="cafe_arabe">Café árabe</option>
              </select>
            </Campo>
          )}
          <Campo label="Superficie (ha)">
            <input type="number" min="0" step="0.01" value={superficie} onChange={(e) => setSuperficie(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Campo>
        </div>

        {/* Captura por método */}
        {metodo === 'cafe' ? (
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Promedio cerezo/bandola">
              <input type="number" min="0" step="0.01" value={promedioBandola} onChange={(e) => setPromedioBandola(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </Campo>
            <Campo label="Plantas por hectárea">
              <input type="number" min="0" value={plantasHa} onChange={(e) => setPlantasHa(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </Campo>
          </div>
        ) : (
          <div className="space-y-2">
            <Campo label="N° total de árboles productivos (parcela)">
              <input type="number" min="0" value={nArboles} onChange={(e) => setNArboles(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </Campo>
            <div>
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Muestra (10 árboles): mazorcas × nº de árboles
              </span>
              <div className="space-y-1.5">
                {bins.map((b, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="number" min="0" placeholder="mazorcas" value={b.mazorcas}
                      onChange={(e) => setBins((bs) => bs.map((x, j) => j === i ? { ...x, mazorcas: e.target.value } : x))}
                      className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
                    <input type="number" min="0" placeholder="nº árboles" value={b.arboles}
                      onChange={(e) => setBins((bs) => bs.map((x, j) => j === i ? { ...x, arboles: e.target.value } : x))}
                      className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
                    <button onClick={() => setBins((bs) => bs.filter((_, j) => j !== i))} className="px-2 text-sm text-rose-500" aria-label="Quitar">×</button>
                  </div>
                ))}
              </div>
              <button onClick={() => setBins((bs) => [...bs, { mazorcas: '', arboles: '' }])} className="mt-1.5 text-sm font-medium text-orange-600 hover:text-orange-700">
                + Agregar grupo
              </button>
            </div>
          </div>
        )}

        {/* Preview en vivo */}
        <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-md bg-slate-50 px-3 py-2 text-sm">
          {metodo === 'cafe' ? (
            <>
              <Chip label="Factor" value={(prev as ReturnType<typeof estimarCafe>).factor} />
              <Chip label="QQ/ha" value={(prev as ReturnType<typeof estimarCafe>).qq_ha} />
              <Chip label="QQ total" value={(prev as ReturnType<typeof estimarCafe>).qq ?? '—'} />
              <Chip label="Kg" value={(prev as ReturnType<typeof estimarCafe>).kg ?? '—'} />
            </>
          ) : (
            <>
              <Chip label="Promedio mazorcas" value={(prev as ReturnType<typeof estimarCacao>).promedio_mazorcas} />
              <Chip label="Total mazorcas" value={(prev as ReturnType<typeof estimarCacao>).total_mazorcas} />
              <Chip label="Kg seco" value={(prev as ReturnType<typeof estimarCacao>).kg_seco} />
            </>
          )}
        </div>

        {/* Negociación */}
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Valor del productor (kg)">
            <input type="number" min="0" step="0.01" value={valorProductor} onChange={(e) => setValorProductor(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Campo>
          <Campo label={`Valor final (kg) — calc. ${kgCalculado ?? '—'}`}>
            <input type="number" min="0" step="0.01" placeholder={kgCalculado != null ? String(kgCalculado) : ''} value={valorFinal} onChange={(e) => setValorFinal(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Campo>
        </div>

        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <Link href="/estimacion" className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancelar</Link>
          <button onClick={guardar} disabled={guardando} className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Guardar estimación'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  )
}

function Chip({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="text-slate-600">
      <span className="text-slate-400">{label}:</span>{' '}
      <span className="font-semibold tabular-nums text-slate-800">{value}</span>
    </span>
  )
}
