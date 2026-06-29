'use client'

// Ficha detail + printable report, faithful to the CASFA "INFORME DE INSPECCIÓN
// INTERNA" .docx layout: numbered sections rendered as question|answer tables,
// a parcela table, and a declaration + signatures block.
// "Descargar PDF" calls window.print(); print CSS (globals.css) hides the chrome.
import Link from 'next/link'
import type { FichaDetalle, FormCampo, FormSeccion, RolMembresia } from '@/lib/types'
import { TIPO_FICHA_LABEL, ESTADO_FICHA_LABEL } from '@/lib/types'
import { MESES, normalizarDatos, type BitacoraActividad } from '@/lib/bitacora'
import FichaEstadoControl from './FichaEstadoControl'

// Section names that are handled specially (parcela table / evaluation block)
// instead of the generic question|answer table.
const EVAL_SECTION = 'Resultados de la evaluación'

export default function FichaReport({
  data,
  rol,
}: {
  data: FichaDetalle
  rol: RolMembresia
}) {
  const { ficha, productor, inspector_nombre, parcelas, template } = data

  const evalSeccion = template?.secciones.find((s) => s.nombre === EVAL_SECTION)
  const criterioSecciones =
    template?.secciones.filter((s) => s.nombre !== EVAL_SECTION) ?? []

  const r = (k: string) => ficha.respuestas[k] ?? null

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-slate-100">
      {/* Toolbar (not printed) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/fichas" className="text-sm text-slate-500 hover:text-slate-700">
            ← Volver
          </Link>
          <FichaEstadoControl fichaId={ficha.id} estado={ficha.estado} rol={rol} />
        </div>
        <div className="flex items-center gap-2">
          {data.bitacora ? (
            <Link
              href={`/bitacora/${data.bitacora.id}`}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Editar bitácora anexa
            </Link>
          ) : (
            <Link
              href={`/bitacora/nueva?ficha=${ficha.id}`}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              + Anexar bitácora
            </Link>
          )}
          <button
            onClick={() => window.print()}
            className="rounded-md bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600"
          >
            Descargar PDF
          </button>
        </div>
      </div>

      {/* Printable sheet */}
      <div className="print-sheet mx-auto my-6 max-w-3xl bg-white p-10 text-[13px] leading-snug text-slate-800 shadow-sm">
        {/* Header image: café for robusta/arabe, cultivo for tropicales */}
        <header className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              ficha.tipo === 'tropicales'
                ? '/referencias/encabezado-cultivo.png'
                : '/referencias/encabezado-cafe.png'
            }
            alt="Encabezado CASFA"
            className="mx-auto w-full max-w-2xl object-contain"
          />
          <h1 className="mt-3 text-center text-base font-bold uppercase text-slate-900">
            Informe de inspección interna
          </h1>
          <p className="text-center text-sm font-semibold uppercase text-slate-600">
            {TIPO_FICHA_LABEL[ficha.tipo]}
          </p>
        </header>

        {/* ID + estado strip */}
        <div className="mb-4 flex justify-between border-y border-slate-300 py-1 text-xs">
          <span>
            <strong>ID:</strong> {ficha.id.slice(0, 8)}
          </span>
          <span>
            <strong>Estado:</strong> {ESTADO_FICHA_LABEL[ficha.estado]}
          </span>
        </div>

        {/* 1. Datos generales */}
        <SectionTitle>1. Datos generales</SectionTitle>
        <table className="mb-4 w-full border-collapse text-xs">
          <tbody>
            <tr>
              <Td b>Nombre del productor</Td>
              <Td>{productor.nombre_completo}</Td>
              <Td b>Código</Td>
              <Td>{productor.codigo}</Td>
            </tr>
            <tr>
              <Td b>Comunidad / Municipio</Td>
              <Td>
                {[productor.comunidad, productor.municipio]
                  .filter(Boolean)
                  .join(' / ') || '—'}
              </Td>
              <Td b>Fecha</Td>
              <Td>{ficha.fecha_inspeccion ?? '—'}</Td>
            </tr>
            <tr>
              <Td b>Inspector</Td>
              <Td>{inspector_nombre ?? '—'}</Td>
              <Td b>Área cultivada</Td>
              <Td>
                {ficha.area_cultivada_ha !== null
                  ? `${Number(ficha.area_cultivada_ha).toFixed(2)} ha`
                  : '—'}
              </Td>
            </tr>
          </tbody>
        </table>

        {/* 2. Información de la parcela (horizontal) */}
        <SectionTitle>Parcelas inspeccionadas</SectionTitle>
        <table className="mb-4 w-full border-collapse text-xs">
          <thead>
            <tr>
              <Th>Nombre de la parcela</Th>
              <Th>Código</Th>
              <Th className="text-right">Área (ha)</Th>
            </tr>
          </thead>
          <tbody>
            {parcelas.map((p) => (
              <tr key={p.codigo_parcela}>
                <Td>{p.nombre || '—'}</Td>
                <Td>{p.codigo_parcela}</Td>
                <Td className="text-right">
                  {p.superficie_declarada_ha !== null
                    ? Number(p.superficie_declarada_ha).toFixed(2)
                    : '—'}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Criterio sections as question|answer tables */}
        {criterioSecciones.map((sec) => (
          <CriterioSection key={sec.id} seccion={sec} respuesta={r} />
        ))}

        {/* Evaluation + declaration block (data-driven from the eval section:
            Robusta uses a single 'hallazgos'; Arabe/Tropicales use hallazgo_1..5). */}
        {evalSeccion && (
          <>
            <SectionTitle>Resultados de la evaluación</SectionTitle>
            <div className="mb-2">
              <div className="text-xs font-semibold">Hallazgos</div>
              <div className="min-h-[3rem] border border-slate-300 p-2 text-xs">
                {evalSeccion.campos
                  .filter((c) => c.nombre_interno.startsWith('hallazgo'))
                  .map((c) => r(c.nombre_interno))
                  .filter((v) => v !== null && v !== '')
                  .map((v, i) => (
                    <div key={i}>• {String(v)}</div>
                  ))}
              </div>
            </div>
            <div className="mb-2 flex gap-6">
              <div className="flex-1">
                <div className="text-xs font-semibold">Resultado de la evaluación</div>
                <div className="border border-slate-300 p-2 text-xs">
                  {(r('resultado_evaluacion') as string) || '—'}
                </div>
              </div>
              {evalSeccion.campos.some((c) => c.nombre_interno === 'fecha_revision') && (
                <div>
                  <div className="text-xs font-semibold">Fecha de revisión</div>
                  <div className="border border-slate-300 p-2 text-xs">
                    {(r('fecha_revision') as string) || '—'}
                  </div>
                </div>
              )}
            </div>

            <SectionTitle>Declaración</SectionTitle>
            <p className="mb-6 text-justify text-xs text-slate-600">
              El productor declara que toda la información presentada
              anteriormente es correcta. Además, se compromete a cumplir con el
              Reglamento Interno de Producción Orgánica de{' '}
              {ficha.tipo === 'tropicales' ? 'Flor de Pascuas' : 'CASFA'} y a
              someterse a las indicaciones y condiciones establecidas por el
              Comité de Evaluación Interna y por las Agencias de Certificación.
            </p>
            <div className="grid grid-cols-2 gap-8">
              <Firma titulo="Productor" data={r('firma_productor') as string | null} />
              <Firma titulo="Inspector interno" data={r('firma_inspector') as string | null} />
            </div>
          </>
        )}

        {/* Anexo: bitácora vinculada a la ficha */}
        {data.bitacora && (
          <BitacoraAnexo datos={normalizarDatos(data.bitacora.datos as never)} anio={data.bitacora.anio} />
        )}
      </div>
    </div>
  )
}

// Anexo de bitácora dentro del PDF de la ficha (calendario compacto).
function BitacoraAnexo({
  datos,
  anio,
}: {
  datos: ReturnType<typeof normalizarDatos>
  anio: number
}) {
  const filas = datos.actividades
  return (
    <div className="report-section mt-6 border-t-2 border-slate-300 pt-3">
      <SectionTitle>Anexo · Bitácora de actividades {anio}</SectionTitle>
      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr>
            <th className="border border-slate-300 bg-slate-50 p-1 text-left">Actividad</th>
            {MESES.map((m) => (
              <th key={m} colSpan={2} className="border border-slate-300 bg-slate-50 p-0.5 text-center">
                {m}
              </th>
            ))}
            <th className="border border-slate-300 bg-slate-50 p-1">$</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((a: BitacoraActividad) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap border border-slate-300 p-1 font-medium">
                {a.nombre}
              </td>
              {a.marcas.map((on, col) => (
                <td key={col} className="border border-slate-200 p-0 text-center">
                  {on ? '✓' : ''}
                </td>
              ))}
              <td className="border border-slate-300 p-1 text-right">
                {a.gastos !== null ? a.gastos : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {datos.observaciones && (
        <p className="mt-2 text-xs">
          <strong>Observaciones:</strong> {datos.observaciones}
        </p>
      )}
    </div>
  )
}

// One numbered criterio section as a question | answer table.
function CriterioSection({
  seccion,
  respuesta,
}: {
  seccion: FormSeccion
  respuesta: (k: string) => string | number | null
}) {
  // Signatures never appear in criterio sections; the eval block handles them.
  const campos = seccion.campos.filter((c) => c.tipo !== 'signature')
  if (campos.length === 0) return null

  return (
    <div className="report-section mb-4">
      <SectionTitle>{seccion.nombre}</SectionTitle>
      <table className="w-full border-collapse text-xs">
        <tbody>
          {campos.map((campo) => (
            <CriterioRow
              key={campo.id}
              campo={campo}
              value={respuesta(campo.nombre_interno)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CriterioRow({
  campo,
  value,
}: {
  campo: FormCampo
  value: string | number | null
}) {
  return (
    <tr>
      <td className="w-[78%] border border-slate-300 p-1.5 align-top">
        {campo.etiqueta}
      </td>
      <td className="border border-slate-300 p-1.5 text-center align-top">
        {value !== null && value !== '' ? String(value) : '—'}
      </td>
    </tr>
  )
}

function Firma({ titulo, data }: { titulo: string; data: string | null }) {
  return (
    <div className="text-center">
      {data && data.startsWith('data:image') ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data}
          alt={titulo}
          className="mx-auto h-20 object-contain"
        />
      ) : (
        <div className="h-20" />
      )}
      <div className="mt-1 border-t border-slate-400 pt-1 text-xs font-medium">
        {titulo}
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-1.5 mt-3 bg-slate-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-700">
      {children}
    </h2>
  )
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th
      className={`border border-slate-300 bg-slate-50 p-1.5 text-left font-semibold ${className}`}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  b,
  className = '',
}: {
  children: React.ReactNode
  b?: boolean
  className?: string
}) {
  return (
    <td
      className={`border border-slate-300 p-1.5 align-top ${b ? 'bg-slate-50 font-semibold' : ''} ${className}`}
    >
      {children}
    </td>
  )
}
