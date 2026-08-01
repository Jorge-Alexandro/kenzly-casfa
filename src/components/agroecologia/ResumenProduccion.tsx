// Producción por cultivo (pedido del SIC): robusta vs. árabe, cada uno en su
// forma nativa (cereza/pergamino) y en café uva, en quintales y en toneladas.
// Server Component — recibe el resumen ya calculado.
import Link from 'next/link'
import type { ResumenCultivo, ResumenProduccion as Resumen } from '@/lib/data/estimacion'

const NATIVO_LABEL: Record<ResumenCultivo['cultivo'], string> = {
  cafe_robusta: 'Cereza (base robusta, 80 kg/qq)',
  cafe_arabe: 'Pergamino (base árabe, 57.5 kg/qq)',
}
const CULTIVO_TITULO: Record<ResumenCultivo['cultivo'], string> = {
  cafe_robusta: 'Café Robusta',
  cafe_arabe: 'Café Arábiga',
}

export default function ResumenProduccion({ resumen }: { resumen: Resumen }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Producción por cultivo</h2>
          <p className="text-xs text-slate-500">
            Ciclo {resumen.ciclo ?? '—'} · quintal = oro invariante · café uva = factor CASFA 5:1
          </p>
        </div>
        {resumen.ciclos.length > 1 && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {resumen.ciclos.map((c) => (
              <Link
                key={c}
                href={`/estimacion?ciclo=${encodeURIComponent(c)}`}
                className={`rounded-full px-2.5 py-1 font-medium ${
                  c === resumen.ciclo
                    ? 'bg-orange-100 text-orange-700'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {c}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <BloqueCultivo cultivo={resumen.robusta} />
        <BloqueCultivo cultivo={resumen.arabe} />
      </div>

      <p className="mt-3 text-xs text-slate-400">
        &quot;Nativo&quot; es la forma en la que CASFA registra cada cultivo en su boleta — no es la
        misma unidad física entre robusta y árabe, por eso va marcada. Café uva y quintales oro sí
        son comparables entre los dos.
      </p>
    </div>
  )
}

function BloqueCultivo({ cultivo: c }: { cultivo: ResumenCultivo }) {
  const vacio = c.n === 0
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">{CULTIVO_TITULO[c.cultivo]}</span>
        <span className="text-xs text-slate-400">{c.n} parcela(s)</span>
      </div>
      {vacio ? (
        <p className="py-3 text-center text-xs text-slate-400">Sin estimaciones en este ciclo.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="pb-1 text-left font-medium">Forma</th>
              <th className="pb-1 text-right font-medium">kg / qq</th>
              <th className="pb-1 text-right font-medium">Toneladas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            <Fila label={NATIVO_LABEL[c.cultivo]} valor={c.nativo_kg} tm={c.nativo_tm} unidad="kg" />
            <Fila label="Café uva (cereza fresca)" valor={c.uva_kg} tm={c.uva_tm} unidad="kg" />
            <Fila label="Oro (quintales)" valor={c.qq_oro} tm={c.oro_tm} unidad="qq" resaltado />
          </tbody>
        </table>
      )}
    </div>
  )
}

function Fila({
  label,
  valor,
  tm,
  unidad,
  resaltado,
}: {
  label: string
  valor: number
  tm: number
  unidad: 'kg' | 'qq'
  resaltado?: boolean
}) {
  return (
    <tr className={resaltado ? 'font-medium text-slate-800' : 'text-slate-600'}>
      <td className="py-1.5 pr-2">{label}</td>
      <td className="py-1.5 text-right tabular-nums">
        {valor.toLocaleString('es-MX', { maximumFractionDigits: unidad === 'qq' ? 3 : 1 })} {unidad}
      </td>
      <td className="py-1.5 text-right tabular-nums">
        {tm.toLocaleString('es-MX', { maximumFractionDigits: 3 })}
      </td>
    </tr>
  )
}
