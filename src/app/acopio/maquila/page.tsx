// Módulo Maquila — los cortes de beneficiado y el MASTER derivado.
// La tabla de abajo ES la hoja 'MASTER MAQUILAS' del Excel, pero calculada:
// ya no se teclea corte por corte.
import { Fragment } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import {
  getMaquilas, getMaster, getInventarioUltimo, getSalidas,
  getInventarioMateriaPrima, getInventarioProductoTerminado,
} from '@/lib/data/maquila'

export const dynamic = 'force-dynamic'

const num = (n: number | null, dec = 1) =>
  n == null ? '—' : n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)

const TIPO_LABEL: Record<string, string> = {
  maquila: 'Maquila',
  repaso_oro: 'Repaso de oro',
  repaso_clasificadora: 'Repaso clasificadora',
}

const GRUPO_LABEL: Record<string, string> = {
  primeras: 'Primeras', segundas: 'Segundas', terceras: 'Terceras', merma: 'Merma',
}

export default async function MaquilaPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const [maquilas, master, inventario, salidas, materiaPrima, productoTerminado] = await Promise.all([
    getMaquilas(),
    getMaster(),
    getInventarioUltimo(),
    getSalidas(),
    getInventarioMateriaPrima(),
    getInventarioProductoTerminado(),
  ])

  const conAvisos = maquilas.filter((m) => m.avisos?.length > 0)
  const totalQq = master.reduce((s, m) => s + Number(m.qq_salida ?? 0), 0)
  const idPorClave = new Map(maquilas.map((m) => [m.clave, m.id]))

  const exportaciones = salidas.filter((s) => s.tipo_salida === 'exportacion')
  const nacionales = salidas.filter((s) => s.tipo_salida === 'nacional')
  const qqExportado = exportaciones.reduce((s, x) => s + Number(x.quintales ?? 0), 0)
  const qqNacional = nacionales.reduce((s, x) => s + Number(x.quintales ?? 0), 0)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link
          href="/acopio"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          ← Acopio
        </Link>
        <a
          href="/api/maquila/costo"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          ↓ Costo de café (Excel)
        </a>
        <Link
          href="/acopio/maquila/importar"
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Importar formatos
        </Link>
        <Link
          href="/acopio/maquila/nuevo"
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700"
        >
          + Nuevo corte
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Maquila</h1>
            <p className="text-sm text-slate-500">
              {maquilas.length} corte{maquilas.length === 1 ? '' : 's'} · {num(totalQq, 0)} QQ de café
              oro obtenidos
              {conAvisos.length > 0 && (
                <span className="text-amber-700"> · {conAvisos.length} con descuadres por revisar</span>
              )}
            </p>
          </div>

          {/* Inventario en vivo — se calcula solo, siempre al día. No es una
              foto que alguien sube; ver más abajo el último Excel cargado. */}
          <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white">
            <div className="border-b border-emerald-100 bg-emerald-50/60 px-4 py-3">
              <h2 className="text-sm font-semibold text-emerald-900">Inventario en vivo — materia prima</h2>
              <p className="text-xs text-emerald-700">
                Café ya acopiado que todavía no entra a ningún corte de maquila. Se calcula solo de
                las boletas de acopio y sus saldos.
              </p>
            </div>
            {materiaPrima.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                No hay café pendiente de procesar: todo lo acopiado ya entró a un corte.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Especie</th>
                      <th className="px-3 py-2 font-medium">Tipo</th>
                      <th className="px-3 py-2 text-right font-medium">Boletas</th>
                      <th className="px-3 py-2 text-right font-medium">Sacos disp.</th>
                      <th className="px-3 py-2 text-right font-medium">Kg disponibles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiaPrima.map((l) => (
                      <tr key={`${l.especie}-${l.tipo}`} className="border-t border-slate-50">
                        <td className="px-3 py-2 text-slate-600">{l.especie}</td>
                        <td className="px-3 py-2 text-slate-700">{l.tipo}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{l.boletas_pendientes}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{num(l.sacos_disponibles, 0)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-800">
                          {num(l.kg_disponibles)} kg
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-700">
                      <td className="px-3 py-2" colSpan={2}>Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {materiaPrima.reduce((s, l) => s + l.boletas_pendientes, 0)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {num(materiaPrima.reduce((s, l) => s + l.sacos_disponibles, 0), 0)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {num(materiaPrima.reduce((s, l) => s + l.kg_disponibles, 0))} kg
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white">
            <div className="border-b border-emerald-100 bg-emerald-50/60 px-4 py-3">
              <h2 className="text-sm font-semibold text-emerald-900">Inventario en vivo — producto terminado</h2>
              <p className="text-xs text-emerald-700">
                Lo que salió del beneficio menos lo ya vendido/embarcado. El stock sólo se puede
                cuadrar por grupo (Primeras/Segundas/Terceras): las salidas nacionales no distinguen
                de qué producto específico venía cada venta.
              </p>
            </div>
            {productoTerminado.some((g) => g.stock_kg < 0) && (
              <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                <strong>Los negativos de abajo no son "inventario en negativo":</strong> significan que
                se vendió/embarcó más de lo que este sistema tiene registrado como producido — casi
                siempre porque falta cargar cortes de maquila anteriores (hoy sólo están los cortes
                digitalizados; la hoja de embarques del Master cubre desde el inicio de temporada).
              </p>
            )}
            {productoTerminado.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                Todavía no hay cortes de maquila con resultado registrado.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Especie</th>
                      <th className="px-3 py-2 font-medium">Grupo</th>
                      <th className="px-3 py-2 text-right font-medium">Producido</th>
                      <th className="px-3 py-2 text-right font-medium">Vendido/embarcado</th>
                      <th className="px-3 py-2 text-right font-medium">Stock (kg)</th>
                      <th className="px-3 py-2 text-right font-medium">Stock (QQ)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productoTerminado.map((g) => {
                      const falta = g.stock_kg < 0
                      return (
                        <Fragment key={`${g.especie}-${g.grupo}`}>
                          <tr className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-600">{g.especie}</td>
                            <td className="px-3 py-2 font-medium text-slate-700">{GRUPO_LABEL[g.grupo] ?? g.grupo}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{num(g.kg_producido)} kg</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{num(g.kg_salido)} kg</td>
                            <td className={`px-3 py-2 text-right font-semibold tabular-nums ${falta ? 'text-amber-700' : 'text-emerald-700'}`}>
                              {num(g.stock_kg)} kg{falta && ' ⚠'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{num(g.stock_qq, 2)}</td>
                          </tr>
                          <tr className="border-t border-slate-50 bg-slate-50/40">
                            <td />
                            <td colSpan={5} className="px-3 py-1.5 text-[11px] text-slate-400">
                              {g.productos.length > 0
                                ? g.productos.map((p) => `${p.nombre} ${num(p.kg_producido, 0)} kg`).join(' · ')
                                : 'Sin cortes de maquila con este producto registrado.'}
                            </td>
                          </tr>
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
              Producido = lo registrado en los cortes de maquila. Vendido/embarcado = la hoja SALIDA
              del Master (exportación + ventas nacionales).
            </p>
          </section>

          {maquilas.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm text-slate-600">Todavía no hay cortes de maquila.</p>
              <Link
                href="/acopio/maquila/importar"
                className="mt-3 inline-block rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700"
              >
                Importar los formatos del encargado
              </Link>
            </div>
          )}

          {master.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-800">Master de maquilas</h2>
                <p className="text-xs text-slate-500">
                  Derivado de los cortes. Sustituye la hoja que hoy se llena a mano.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-xs">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Corte</th>
                      <th className="px-3 py-2 font-medium">Fecha</th>
                      <th className="px-3 py-2 font-medium">Café</th>
                      <th className="px-3 py-2 text-right font-medium">QQ entrada</th>
                      <th className="px-3 py-2 text-right font-medium">Primeras</th>
                      <th className="px-3 py-2 text-right font-medium">%</th>
                      <th className="px-3 py-2 text-right font-medium">Segundas</th>
                      <th className="px-3 py-2 text-right font-medium">%</th>
                      <th className="px-3 py-2 text-right font-medium">Terceras</th>
                      <th className="px-3 py-2 text-right font-medium">%</th>
                      <th className="px-3 py-2 text-right font-medium">QQ oro</th>
                      <th className="px-3 py-2 text-right font-medium">Rend.</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {master.map((m) => (
                      <tr key={m.clave} className="border-t border-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-800">{m.clave}</td>
                        <td className="px-3 py-2 text-slate-600">{m.fecha_corte}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {m.especie} {m.tipo_entrada}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {num(m.qq_entrada, 0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                          {num(m.qq_primeras, 0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                          {pct(m.rend_primeras)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                          {num(m.qq_segundas, 0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                          {pct(m.rend_segundas)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                          {num(m.qq_terceras, 0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                          {pct(m.rend_terceras)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-800">
                          {num(m.qq_salida, 0)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {pct(m.rendimiento)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {idPorClave.get(m.clave) && (
                            <a
                              href={`/api/maquila/${idPorClave.get(m.clave)}/pdf`}
                              className="text-xs font-medium text-orange-700 hover:underline"
                            >
                              PDF
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {conAvisos.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-amber-200 bg-white">
              <div className="border-b border-amber-100 bg-amber-50/60 px-4 py-3">
                <h2 className="text-sm font-semibold text-amber-900">Cortes con descuadres</h2>
                <p className="text-xs text-amber-700">
                  Se importaron con el dato tal como venía; esto es lo que no cierra.
                </p>
              </div>
              <ul className="divide-y divide-slate-100">
                {conAvisos.map((m) => (
                  <li key={m.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-800">
                      {m.clave} · {m.fecha_corte}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {m.avisos.map((a, i) => (
                        <li key={i} className="flex gap-2 text-xs">
                          <span
                            className={`mt-px shrink-0 rounded px-1.5 py-0.5 font-medium ${
                              a.nivel === 'error'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {a.nivel === 'error' ? 'No cuadra' : 'Revisar'}
                          </span>
                          <span className="text-slate-600">{a.mensaje}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {salidas.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-800">Programación de entregas</h2>
                <p className="text-xs text-slate-500">
                  {exportaciones.length} exportaciones ({num(qqExportado, 0)} QQ) ·{' '}
                  {nacionales.length} salidas nacionales ({num(qqNacional, 0)} QQ)
                </p>
              </div>
              <div className="max-h-96 overflow-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Fecha</th>
                      <th className="px-3 py-2 font-medium">Guía / folio</th>
                      <th className="px-3 py-2 font-medium">Café</th>
                      <th className="px-3 py-2 font-medium">Lote</th>
                      <th className="px-3 py-2 font-medium">Destino</th>
                      <th className="px-3 py-2 text-right font-medium">Sacos</th>
                      <th className="px-3 py-2 text-right font-medium">QQ</th>
                      <th className="px-3 py-2 font-medium">Vía</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salidas.map((s) => (
                      <tr key={s.id} className="border-t border-slate-50">
                        <td className="px-3 py-2 text-slate-600">{s.fecha_salida}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {s.guia ?? (s.folio != null ? `folio ${s.folio}` : '—')}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{s.producto_texto ?? '—'}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-600">
                          {s.numero_lote ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{s.destino ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {num(Number(s.sacos), 2)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-800">
                          {num(Number(s.quintales), 1)}
                        </td>
                        <td className="px-3 py-2 text-slate-500">
                          {s.transporte ?? s.canal ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {inventario && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-800">
                  Último Excel de inventario cargado — {inventario.fecha}
                </h2>
                <p className="text-xs text-slate-400">
                  Referencia histórica: la foto que subieron ese día. El inventario en vivo de arriba
                  es el que está al día hoy.
                </p>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {inventario.lineas.map((l, i) => (
                    <tr key={i} className="border-t border-slate-50">
                      <td className="px-3 py-2 text-slate-500">{l.especie}</td>
                      <td className="px-3 py-2 text-slate-700">{l.producto_texto}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {l.stock_sacos} s/c
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-800">
                        {num(Number(l.stock_kg))} kg
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {maquilas.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-800">Cortes</h2>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {maquilas.map((m) => (
                    <tr key={m.id} className="border-t border-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-800">{m.clave}</td>
                      <td className="px-3 py-2 text-slate-600">{m.fecha_corte}</td>
                      <td className="px-3 py-2 text-slate-500">{TIPO_LABEL[m.tipo_proceso]}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {num(Number(m.kg_entrada), 0)} kg
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                        {num(Number(m.kg_salida), 0)} kg
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                        {pct(m.rendimiento)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
