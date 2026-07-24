// Resumen de los dos almacenes para las boletas de la cooperativa FLO
// (Chula Vista): cuánto de lo acopiado es de la cooperativa (no se paga) y
// cuánto lo compró CASFASA (el excedente sobre la estimación del LPA).
//
// La gracia de esta vista es que CUADRA: cada kilo entregado queda asignado a
// exactamente un almacén (FLO + CASFASA = kg entregados), que es justo lo que no
// pasaba cuando se bajaba el listado por comunidad.
import { baseKg, fmtNum, fmtMXN, type BoletaCosto } from '@/lib/contabilidad/tipos'

interface Fila {
  proveedor: string
  boletas: number
  estimacion: number | null
  entregado: number
  flo: number
  casfasa: number
  importe: number
  ajustadas: number
}

export default function ResumenAlmacenes({ boletas }: { boletas: BoletaCosto[] }) {
  const coop = boletas.filter((b) => b.es_cooperativa)
  if (coop.length === 0) return null

  const porProductor = new Map<string, Fila>()
  for (const b of coop) {
    const base = baseKg(b) // kg que paga CASFASA en esta boleta (auto o ajustado)
    const f =
      porProductor.get(b.proveedor_nombre) ??
      {
        proveedor: b.proveedor_nombre,
        boletas: 0,
        estimacion: b.estimacion_kg,
        entregado: 0,
        flo: 0,
        casfasa: 0,
        importe: 0,
        ajustadas: 0,
      }
    f.boletas++
    f.entregado += b.kg_netos
    f.casfasa += base
    f.flo += b.kg_netos - base
    f.importe += b.importe ?? 0
    if (b.kg_pagable != null) f.ajustadas++
    porProductor.set(b.proveedor_nombre, f)
  }

  const filas = Array.from(porProductor.values()).sort(
    (a, b) => b.casfasa - a.casfasa || b.entregado - a.entregado,
  )
  const tot = filas.reduce(
    (a, f) => ({
      entregado: a.entregado + f.entregado,
      flo: a.flo + f.flo,
      casfasa: a.casfasa + f.casfasa,
      importe: a.importe + f.importe,
    }),
    { entregado: 0, flo: 0, casfasa: 0, importe: 0 },
  )
  const cuadra = Math.abs(tot.flo + tot.casfasa - tot.entregado) < 0.5

  return (
    <section className="rounded-xl border border-sky-200 bg-white">
      <div className="border-b border-sky-100 bg-sky-50/60 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-800">
          Almacenes — Cooperativa FLO (Chula Vista) vs CASFASA
        </h2>
        <p className="text-xs text-sky-700">
          Lo que cabe en la estimación de cosecha del productor (LPA) es de la cooperativa y no se
          paga. El excedente lo compra CASFASA. Cada kilo queda en un solo almacén.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Caja label="Entregado en Chula Vista" value={`${fmtNum(tot.entregado, 1)} kg`} />
        <Caja label="Cooperativa FLO — no se paga" value={`${fmtNum(tot.flo, 1)} kg`} />
        <Caja label="CASFASA — se paga" value={`${fmtNum(tot.casfasa, 1)} kg`} destacado />
        <Caja label="Importe de lo pagable" value={fmtMXN(tot.importe)} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Productor</th>
              <th className="px-3 py-2 text-right">Boletas</th>
              <th className="px-3 py-2 text-right">Estim. LPA</th>
              <th className="px-3 py-2 text-right">Entregado</th>
              <th className="px-3 py-2 text-right">→ FLO</th>
              <th className="px-3 py-2 text-right">→ CASFASA</th>
              <th className="px-3 py-2 text-right">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((f) => (
              <tr key={f.proveedor} className={f.casfasa > 0.005 ? 'bg-amber-50/40' : undefined}>
                <td className="px-3 py-2 text-slate-800">
                  {f.proveedor}
                  {f.ajustadas > 0 && (
                    <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {f.ajustadas} ajustada{f.ajustadas === 1 ? '' : 's'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{f.boletas}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtNum(f.estimacion, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtNum(f.entregado, 1)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-sky-700">{fmtNum(f.flo, 1)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700">
                  {f.casfasa > 0.005 ? fmtNum(f.casfasa, 1) : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                  {f.importe > 0.005 ? fmtMXN(f.importe) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold text-slate-700">
            <tr>
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{coop.length}</td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right tabular-nums">{fmtNum(tot.entregado, 1)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-sky-700">{fmtNum(tot.flo, 1)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-amber-700">{fmtNum(tot.casfasa, 1)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMXN(tot.importe)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="px-4 py-2 text-xs text-slate-400">
        {cuadra
          ? `Cuadra: ${fmtNum(tot.flo, 1)} + ${fmtNum(tot.casfasa, 1)} = ${fmtNum(tot.entregado, 1)} kg entregados.`
          : 'Revisar: la suma de los dos almacenes no coincide con lo entregado.'}
      </p>
    </section>
  )
}

function Caja({ label, value, destacado }: { label: string; value: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destacado ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className={`text-xs ${destacado ? 'text-amber-800' : 'text-slate-500'}`}>{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${destacado ? 'text-amber-700' : 'text-slate-800'}`}>
        {value}
      </div>
    </div>
  )
}
