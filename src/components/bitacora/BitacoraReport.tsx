'use client'

// Printable bitácora report, faithful to the CASFA .docx: activity calendar
// (12 months × 2 quincenas), insumos table and observaciones, under the header.
import Link from 'next/link'
import { MESES, type BitacoraDatos, type BitacoraActividad } from '@/lib/bitacora'

interface Props {
  anio: number
  datos: BitacoraDatos
  parcelaLabel: string
  productor: string
  comunidad: string | null
  // café o tropical define el encabezado
  esCafe: boolean
}

export default function BitacoraReport({
  anio,
  datos,
  parcelaLabel,
  productor,
  comunidad,
  esCafe,
}: Props) {
  const manejo = datos.actividades.filter((a) => a.grupo === 'manejo')
  const cosecha = datos.actividades.filter((a) => a.grupo === 'cosecha')

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-slate-100">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <Link href="/bitacora" className="text-sm text-slate-500 hover:text-slate-700">
          ← Volver a bitácoras
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded-md bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
        >
          Descargar PDF
        </button>
      </div>

      <div className="print-sheet mx-auto my-6 max-w-5xl bg-white p-8 text-[12px] text-slate-800 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={esCafe ? '/referencias/encabezado-cafe.png' : '/referencias/encabezado-cultivo.png'}
          alt="Encabezado CASFA"
          className="mx-auto mb-3 w-full max-w-2xl object-contain"
        />
        <h1 className="mb-1 text-center text-base font-bold uppercase">
          Bitácora de actividades {anio}
        </h1>
        <p className="mb-4 text-center text-xs text-slate-600">
          {parcelaLabel} — Productor: {productor}
          {comunidad ? ` · Comunidad: ${comunidad}` : ''}
        </p>

        <TablaActividades titulo="Manejo en campo" actividades={manejo} />
        <TablaActividades titulo="Estimación de cosecha" actividades={cosecha} />

        {/* Insumos */}
        <h2 className="mb-1 mt-4 bg-slate-100 px-2 py-1 text-xs font-bold uppercase">
          Sustancias para control de plagas, malezas y enfermedades
        </h2>
        <table className="mb-4 w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-50">
              <Th>Nombre del producto</Th>
              <Th>Ingrediente activo</Th>
              <Th>Ingredientes inertes</Th>
              <Th>Origen</Th>
              <Th>Dosis kg/ha</Th>
              <Th>Fecha aplicación</Th>
            </tr>
          </thead>
          <tbody>
            {datos.insumos.map((ins, i) => (
              <tr key={i}>
                <Td>{ins.nombre_producto || '—'}</Td>
                <Td>{ins.ingrediente_activo || '—'}</Td>
                <Td>{ins.ingredientes_inertes || '—'}</Td>
                <Td>{ins.origen || '—'}</Td>
                <Td>{ins.dosis_kg_ha || '—'}</Td>
                <Td>{ins.fecha_aplicacion || '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mb-1 bg-slate-100 px-2 py-1 text-xs font-bold uppercase">
          Observaciones
        </h2>
        <div className="min-h-[3rem] border border-slate-300 p-2 text-xs">
          {datos.observaciones || ''}
        </div>
      </div>
    </div>
  )
}

function TablaActividades({
  titulo,
  actividades,
}: {
  titulo: string
  actividades: BitacoraActividad[]
}) {
  return (
    <div className="report-section mb-3">
      <h2 className="mb-1 bg-slate-100 px-2 py-1 text-xs font-bold uppercase">{titulo}</h2>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="border border-slate-300 bg-slate-50 p-1 text-left">Actividad</th>
            {MESES.map((m) => (
              <th key={m} colSpan={2} className="border border-slate-300 bg-slate-50 p-0.5 text-center">
                {m}
              </th>
            ))}
            <th className="border border-slate-300 bg-slate-50 p-1 text-center">Gastos</th>
          </tr>
          <tr>
            <th className="border border-slate-300 bg-slate-50"></th>
            {MESES.map((m) => (
              <th key={m} colSpan={2} className="border border-slate-300 bg-slate-50 p-0 text-center text-[8px] text-slate-400">
                15 · 30
              </th>
            ))}
            <th className="border border-slate-300 bg-slate-50"></th>
          </tr>
        </thead>
        <tbody>
          {actividades.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap border border-slate-300 p-1 font-medium">
                {a.nombre}
                {a.detalle ? `: ${a.detalle}` : ''}
              </td>
              {a.marcas.map((on, col) => (
                <td
                  key={col}
                  className="border border-slate-200 p-0 text-center align-middle"
                >
                  {on ? '✓' : ''}
                </td>
              ))}
              <td className="border border-slate-300 p-1 text-right tabular-nums">
                {a.gastos !== null ? a.gastos : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border border-slate-300 p-1 text-left font-semibold">{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="border border-slate-300 p-1">{children}</td>
}
