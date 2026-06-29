'use client'

// Reporte imprimible del historial: filas = campos, columnas = años (como el
// formato real), bajo el encabezado de CASFA.
import Link from 'next/link'
import { HISTORIAL_CAMPOS, HISTORIAL_NOTA, type HistorialAnio } from '@/lib/historial'

interface Props {
  parcelaLabel: string
  productor: string
  comunidad: string | null
  esCafe: boolean
  anios: HistorialAnio[]
}

export default function HistorialReport({
  parcelaLabel,
  productor,
  comunidad,
  esCafe,
  anios,
}: Props) {
  const cols = [...anios].sort((a, b) => a.anio - b.anio)

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <Link href="/historial" className="text-sm text-slate-500 hover:text-slate-700">
          ← Volver
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-md bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
        >
          Descargar PDF
        </button>
      </div>

      <div className="print-sheet mx-auto my-6 max-w-4xl bg-white p-8 text-[12px] text-slate-800 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={esCafe ? '/referencias/encabezado-cafe.png' : '/referencias/encabezado-cultivo.png'}
          alt="Encabezado CASFA"
          className="mx-auto mb-3 w-full max-w-2xl object-contain"
        />
        <h1 className="mb-1 text-center text-base font-bold uppercase">
          Historial del manejo
        </h1>
        <p className="mb-4 text-center text-xs text-slate-600">
          {parcelaLabel} — Productor: {productor}
          {comunidad ? ` · Comunidad: ${comunidad}` : ''}
        </p>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="border border-slate-300 bg-slate-50 p-1.5 text-left">Manejo</th>
              {cols.map((a) => (
                <th key={a.anio} className="border border-slate-300 bg-slate-50 p-1.5 text-center">
                  {a.anio}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HISTORIAL_CAMPOS.map((campo) => (
              <tr key={campo.id}>
                <td className="border border-slate-300 p-1.5 font-medium">{campo.label}</td>
                {cols.map((a) => {
                  const v = a.datos[campo.id]
                  return (
                    <td key={a.anio} className="border border-slate-300 p-1.5 text-center">
                      {v !== null && v !== undefined && v !== '' ? String(v) : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-3 text-[10px] text-slate-500">* {HISTORIAL_NOTA}</p>
      </div>
    </div>
  )
}
