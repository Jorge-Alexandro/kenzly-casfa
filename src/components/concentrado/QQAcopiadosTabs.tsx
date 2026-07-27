'use client'

// QQ acopiados por mes, en pestañas por tipo de café (petición de Francisco).
// Cada pestaña muestra los meses de ese tipo con kilos, quintales e importe; la
// pestaña "Resumen" compara todos los tipos de un vistazo. El cacao va aparte
// porque no lleva quintal.
import { useState } from 'react'
import { fmtMXN, fmtNum, type QQAcopiados, type CeldaAcopio } from '@/lib/acopio/concentrado'

const RESUMEN = '__resumen__'

export default function QQAcopiadosTabs({ data }: { data: QQAcopiados }) {
  const [tab, setTab] = useState<string>(RESUMEN)
  const hayCacao = data.cacao.boletas > 0

  const tabs = [
    { id: RESUMEN, label: 'Resumen' },
    ...data.tipos.map((t) => ({ id: t, label: t })),
    ...(hayCacao ? [{ id: 'CACAO', label: 'Cacao' }] : []),
  ]

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          QQ acopiados por mes y tipo de café
        </h2>
      </div>

      {/* Pestañitas */}
      <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 pt-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-md px-3 py-1.5 text-sm font-medium ${
              tab === t.id
                ? 'border border-b-white border-slate-200 bg-white text-orange-700'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto p-3">
        {tab === RESUMEN ? (
          <Resumen data={data} />
        ) : tab === 'CACAO' ? (
          <Cacao data={data} />
        ) : (
          <PorTipo tipo={tab} data={data} />
        )}
      </div>
    </section>
  )
}

/** Todos los tipos de un vistazo: una fila por tipo. */
function Resumen({ data }: { data: QQAcopiados }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-3 py-2">Tipo de café</th>
          <th className="px-3 py-2 text-right">Boletas</th>
          <th className="px-3 py-2 text-right">Kg netos</th>
          <th className="px-3 py-2 text-right">Quintales</th>
          <th className="px-3 py-2 text-right">Importe</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {data.tipos.map((t) => {
          const c = data.totalPorTipo[t] ?? vacia
          return (
            <tr key={t}>
              <td className="px-3 py-2 font-medium text-slate-700">{t}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-500">{c.boletas}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtNum(c.kg, 2)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{fmtNum(c.qq, 2)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtMXN(c.importe)}</td>
            </tr>
          )
        })}
      </tbody>
      <tfoot className="bg-slate-50 font-semibold text-slate-700">
        <tr>
          <td className="px-3 py-2">TOTAL CAFÉ</td>
          <td className="px-3 py-2 text-right tabular-nums">{data.total.boletas}</td>
          <td className="px-3 py-2 text-right tabular-nums">{fmtNum(data.total.kg, 2)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{fmtNum(data.total.qq, 2)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{fmtMXN(data.total.importe)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

/** Un solo tipo de café: sus meses. */
function PorTipo({ tipo, data }: { tipo: string; data: QQAcopiados }) {
  const filas = data.filas
    .map((f) => ({ mes: f.mes, c: f.porTipo[tipo] }))
    .filter((x): x is { mes: string; c: CeldaAcopio } => Boolean(x.c))
  const total = data.totalPorTipo[tipo] ?? vacia

  if (filas.length === 0) {
    return <p className="px-1 py-4 text-sm text-slate-400">Sin acopio de {tipo} en este periodo.</p>
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th className="px-3 py-2">Mes</th>
          <th className="px-3 py-2 text-right">Boletas</th>
          <th className="px-3 py-2 text-right">Kg netos</th>
          <th className="px-3 py-2 text-right">Quintales</th>
          <th className="px-3 py-2 text-right">Importe</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {filas.map(({ mes, c }) => (
          <tr key={mes}>
            <td className="px-3 py-2 font-medium text-slate-700">{mes}</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-500">{c.boletas}</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtNum(c.kg, 2)}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{fmtNum(c.qq, 2)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtMXN(c.importe)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot className="bg-slate-50 font-semibold text-slate-700">
        <tr>
          <td className="px-3 py-2">TOTAL {tipo}</td>
          <td className="px-3 py-2 text-right tabular-nums">{total.boletas}</td>
          <td className="px-3 py-2 text-right tabular-nums">{fmtNum(total.kg, 2)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{fmtNum(total.qq, 2)}</td>
          <td className="px-3 py-2 text-right tabular-nums">{fmtMXN(total.importe)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

/** Cacao: no lleva quintal, se reporta en kilos. */
function Cacao({ data }: { data: QQAcopiados }) {
  return (
    <div className="max-w-md">
      <p className="mb-2 text-xs text-slate-500">
        El cacao no lleva factor de quintal: se acopia y se reporta en kilos.
      </p>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          <tr>
            <td className="px-3 py-2 text-slate-600">Boletas</td>
            <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{data.cacao.boletas}</td>
          </tr>
          <tr>
            <td className="px-3 py-2 text-slate-600">Kilos netos</td>
            <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{fmtNum(data.cacao.kg, 2)}</td>
          </tr>
          <tr>
            <td className="px-3 py-2 text-slate-600">Importe</td>
            <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{fmtMXN(data.cacao.importe)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const vacia: CeldaAcopio = { kg: 0, qq: 0, importe: 0, boletas: 0 }
