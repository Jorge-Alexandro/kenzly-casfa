'use client'

// Ficha detail + printable report, faithful to the CASFA "INFORME DE INSPECCIÓN
// INTERNA" .docx layout: numbered sections rendered as question|answer tables,
// a parcela table, and a declaration + signatures block.
// "Descargar PDF" calls window.print(); print CSS (globals.css) hides the chrome.
import Link from 'next/link'
import type { FichaDetalle, FormCampo, FormSeccion, RolMembresia } from '@/lib/types'
import { TIPO_FICHA_LABEL, ESTADO_FICHA_LABEL } from '@/lib/types'
import { MESES, normalizarDatos, type BitacoraActividad } from '@/lib/bitacora'
import { HISTORIAL_CAMPOS } from '@/lib/historial'
import { codigoCorto, esSeccionPorParcela } from '@/lib/format'
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
          {rol !== 'solo_lectura' && (
            <Link
              href={`/fichas/${ficha.id}/editar`}
              className="rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-100"
            >
              Editar ficha
            </Link>
          )}
          <Link
            href={data.bitacora ? `/bitacora/${data.bitacora.id}` : `/bitacora/nueva?ficha=${ficha.id}`}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {data.bitacora ? 'Editar bitácora' : '+ Bitácora'}
          </Link>
          {parcelas[0] && (
            <Link
              href={`/historial/${parcelas[0].id}`}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {data.historial ? 'Editar historial' : '+ Historial'}
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
        {/* Encabezado: Robusta = Flor de Pascuas; tropicales = cultivo; arábica = café */}
        <header className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              ficha.tipo === 'robusta'
                ? '/referencias/encabezado-robusta.png'
                : ficha.tipo === 'tropicales'
                  ? '/referencias/encabezado-cultivo.png'
                  : '/referencias/encabezado-cafe.png'
            }
            alt={ficha.tipo === 'robusta' ? 'Encabezado Flor de Pascuas' : 'Encabezado CASFA'}
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
            <tr>
              <Td b>Hora de inicio</Td>
              <Td>{(r('hora_inicio') as string) || '—'}</Td>
              <Td b>Hora de término</Td>
              <Td>{(r('hora_fin') as string) || '—'}</Td>
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
                <Td>{codigoCorto(p.codigo_parcela, p.nombre)}</Td>
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
          <CriterioSection key={sec.id} seccion={sec} respuesta={r} parcelas={parcelas} />
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
              {ficha.tipo === 'tropicales' || ficha.tipo === 'robusta' ? 'Flor de Pascuas' : 'CASFA'} y a
              someterse a las indicaciones y condiciones establecidas por el
              Comité de Evaluación Interna y por las Agencias de Certificación.
            </p>
            <div className="grid grid-cols-3 gap-6">
              <Firma titulo="Productor" data={r('firma_productor') as string | null} />
              <Firma titulo="Inspector interno" data={r('firma_inspector') as string | null} />
              <Firma titulo="Comité de aprobación" data={r('firma_comite') as string | null} />
            </div>
          </>
        )}

        {/* Anexo: bitácora vinculada a la ficha */}
        {data.bitacora && (
          <BitacoraAnexo datos={normalizarDatos(data.bitacora.datos as never)} anio={data.bitacora.anio} />
        )}

        {/* Anexo: historial de manejo de la parcela */}
        {data.historial && data.historial.anios.length > 0 && (
          <HistorialAnexo anios={data.historial.anios} />
        )}
      </div>
    </div>
  )
}

// Anexo de historial dentro del PDF de la ficha (campos × años).
function HistorialAnexo({
  anios,
}: {
  anios: { anio: number; datos: unknown }[]
}) {
  const cols = [...anios].sort((a, b) => a.anio - b.anio)
  const val = (datos: unknown, id: string) => {
    const d = (datos ?? {}) as Record<string, unknown>
    const v = d[id]
    return v === null || v === undefined || v === '' ? '—' : String(v)
  }
  return (
    <div className="report-section mt-6 border-t-2 border-slate-300 pt-3">
      <SectionTitle>Anexo · Historial de manejo</SectionTitle>
      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr>
            <th className="border border-slate-300 bg-slate-50 p-1 text-left">Manejo</th>
            {cols.map((c) => (
              <th key={c.anio} className="border border-slate-300 bg-slate-50 p-1 text-center">
                {c.anio}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HISTORIAL_CAMPOS.map((campo) => (
            <tr key={campo.id}>
              <td className="border border-slate-300 p-1 font-medium">{campo.label}</td>
              {cols.map((c) => (
                <td key={c.anio} className="border border-slate-300 p-1 text-center">
                  {val(c.datos, campo.id)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
  parcelas,
}: {
  seccion: FormSeccion
  respuesta: (k: string) => unknown
  parcelas: { id: string; codigo_parcela: string; nombre: string | null }[]
}) {
  // Signatures never appear in criterio sections; the eval block handles them.
  // Las tablas (variedades, diversidad) se muestran como bloques propios.
  const campos = seccion.campos.filter((c) => c.tipo !== 'signature')
  if (campos.length === 0) return null

  const filaCampos = campos.filter((c) => c.tipo !== 'tabla')
  const tablaCampos = campos.filter((c) => c.tipo === 'tabla')

  // #D Cuando la ficha tiene 2+ parcelas, la sección de la parcela se guardó
  // por parcela (claves `campo::parcelaId`): la mostramos separada.
  const porParcela = esSeccionPorParcela(seccion.nombre) && parcelas.length > 1

  function bloque(sufijo: string) {
    const val = (c: FormCampo) => respuesta(`${c.nombre_interno}${sufijo}`)
    return (
      <>
        {tablaCampos.map((campo) => (
          <TablaCriterio key={campo.id} campo={campo} value={val(campo)} />
        ))}
        {filaCampos.length > 0 && (
          <table className="w-full border-collapse text-xs">
            <tbody>
              {filaCampos.map((campo) => (
                <CriterioRow key={campo.id} campo={campo} value={val(campo)} />
              ))}
            </tbody>
          </table>
        )}
      </>
    )
  }

  return (
    <div className="report-section mb-4">
      <SectionTitle>{seccion.nombre}</SectionTitle>
      {porParcela ? (
        parcelas.map((p) => (
          <div key={p.id} className="mb-3">
            <p className="mb-1 text-xs font-semibold text-slate-700">
              Parcela: {codigoCorto(p.codigo_parcela, p.nombre)}
              {p.nombre ? ` — ${p.nombre}` : ''}
            </p>
            {bloque(`::${p.id}`)}
          </div>
        ))
      ) : (
        bloque('')
      )}
    </div>
  )
}

// Muestra un valor de respuesta: arreglos (multi) unidos por coma; escalares tal cual.
function mostrarValor(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) {
    const s = (value as unknown[]).map((v) => String(v)).filter(Boolean).join(', ')
    return s || '—'
  }
  return String(value)
}

function CriterioRow({ campo, value }: { campo: FormCampo; value: unknown }) {
  return (
    <tr>
      <td className="w-[78%] border border-slate-300 p-1.5 align-top">
        {campo.etiqueta}
      </td>
      <td className="border border-slate-300 p-1.5 text-center align-top">
        {mostrarValor(value)}
      </td>
    </tr>
  )
}

// Renderiza un campo tipo 'tabla' (variedades, diversidad…) en el PDF.
function TablaCriterio({ campo, value }: { campo: FormCampo; value: unknown }) {
  const cols = campo.config?.columnas ?? []
  const filas = Array.isArray(value)
    ? (value as Record<string, unknown>[]).filter((f) =>
        cols.some((c) => f[c.id] !== null && f[c.id] !== undefined && f[c.id] !== ''),
      )
    : []
  return (
    <div className="mb-2">
      <div className="mb-1 text-xs font-semibold">{campo.etiqueta}</div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-slate-50">
            {cols.map((c) => (
              <th key={c.id} className="border border-slate-300 p-1 text-left font-semibold">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr>
              <td colSpan={cols.length} className="border border-slate-300 p-1 text-center text-slate-400">
                —
              </td>
            </tr>
          ) : (
            filas.map((fila, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.id} className="border border-slate-300 p-1">
                    {fila[c.id] !== null && fila[c.id] !== undefined && fila[c.id] !== ''
                      ? String(fila[c.id])
                      : '—'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
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
