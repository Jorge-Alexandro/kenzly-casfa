// CRM — Ficha 360° de una cuenta: datos, contactos, oportunidades (con
// productos e historial de etapas), actividades y — si está vinculada a un
// cliente fiscal — el historial REAL de Ventas (total, última compra,
// productos habituales, ticket promedio, precios acordados y facturas).
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getCuentaDetalle, getMiembrosOrg } from '@/lib/data/crm'
import { getClientes, getProductos } from '@/lib/data/ventas'
import { puedeEditarCRM } from '@/lib/crm/permisos'
import { valorPonderado, actividadVencida, cierreVencido } from '@/lib/crm/calculos.mjs'
import {
  ESTATUS_CUENTA_LABEL,
  ETAPA_BADGE,
  ETAPA_LABEL,
  ETAPAS_ABIERTAS,
  TIPO_ACTIVIDAD_LABEL,
  TIPO_CUENTA_BADGE,
  TIPO_CUENTA_LABEL,
  nombreMiembro,
} from '@/lib/crm/tipos'
import { formatoMXN, formatoNum, ORIGEN_BADGE, ORIGEN_LABEL, type OrigenVenta } from '@/lib/ventas/tipos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import CuentaAcciones from '@/components/crm/CuentaAcciones'
import OportunidadAcciones from '@/components/crm/OportunidadAcciones'
import ContactoEditarBoton from '@/components/crm/ContactoEditarBoton'
import CompletarActividadBoton from '@/components/crm/CompletarActividadBoton'
import { fechaCorta } from '@/components/crm/ui'

export const dynamic = 'force-dynamic'

export default async function CuentaFichaPage({ params }: { params: { id: string } }) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />
  const puedeEditar = puedeEditarCRM(result.session.rol)

  const [detalle, miembros, productos, clientesFiscales] = await Promise.all([
    getCuentaDetalle(params.id),
    getMiembrosOrg(),
    getProductos(),
    getClientes(),
  ])
  if (!detalle) notFound()

  const { cuenta, contactos, oportunidades, actividades, ventas360 } = detalle
  const porNombre = new Map(miembros.map((m) => [m.id, nombreMiembro(m)]))
  const abiertas = oportunidades.filter((o) => (ETAPAS_ABIERTAS as string[]).includes(o.etapa))
  const pendientes = actividades.filter((a) => !a.completada_at)
  const historialAct = actividades.filter((a) => a.completada_at)

  const datos: [string, string | null][] = [
    ['Teléfono', cuenta.telefono],
    ['Correo', cuenta.email],
    ['Sitio web', cuenta.sitio_web],
    ['Dirección', cuenta.direccion],
    ['Segmento', cuenta.segmento],
    ['Origen', cuenta.origen],
    ['Responsable', cuenta.responsable_id ? porNombre.get(cuenta.responsable_id) ?? null : null],
  ]

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre}>
        <Link
          href="/crm/cuentas"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          ← Cuentas
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          {/* Encabezado */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold text-slate-800">{cuenta.nombre}</h1>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_CUENTA_BADGE[cuenta.tipo]}`}>
                    {TIPO_CUENTA_LABEL[cuenta.tipo]}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {ESTATUS_CUENTA_LABEL[cuenta.estatus]}
                  </span>
                  {ventas360 && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-mono text-xs font-medium text-emerald-700">
                      {ventas360.cliente.rfc}
                    </span>
                  )}
                </div>
                {cuenta.nombre_comercial && <p className="mt-0.5 text-sm text-slate-500">{cuenta.nombre_comercial}</p>}
              </div>
              {puedeEditar && (
                <CuentaAcciones
                  cuenta={cuenta}
                  miembros={miembros}
                  productos={productos.map((p) => ({ id: p.id, nombre: p.nombre, linea: p.linea, unidad: p.unidad }))}
                  oportunidadesAbiertas={abiertas.map((o) => ({ id: o.id, nombre: o.nombre }))}
                  clientesFiscales={clientesFiscales.map((c) => ({ id: c.id, rfc: c.rfc, nombre: c.nombre }))}
                />
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
              {datos.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className="truncate text-slate-700">{v}</dd>
                </div>
              ))}
            </dl>
            {cuenta.notas && <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{cuenta.notas}</p>}
          </div>

          {/* Historial de Ventas (fuente de verdad) */}
          {ventas360 && (
            <div className="rounded-xl border border-emerald-200 bg-white p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-800">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                Historial de Ventas · {ventas360.cliente.nombre}
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Total comprado</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-slate-800">{formatoMXN(ventas360.total_comprado)}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Última compra</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-slate-800">{fechaCorta(ventas360.ultima_compra)}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Ticket promedio</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-slate-800">{formatoMXN(ventas360.ticket_promedio)}</p>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Ventas registradas</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-slate-800">{ventas360.num_ventas}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Productos habituales</h3>
                  {ventas360.productos_habituales.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">Sin ventas registradas.</p>
                  ) : (
                    <table className="mt-2 w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {ventas360.productos_habituales.map((p) => (
                          <tr key={p.nombre}>
                            <td className="max-w-[14rem] truncate py-1.5 text-slate-700">{p.nombre}</td>
                            <td className="py-1.5 text-right font-mono text-xs tabular-nums text-slate-500">{formatoNum(p.cantidad, 1)}</td>
                            <td className="py-1.5 text-right font-mono tabular-nums text-slate-700">{formatoMXN(p.importe)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Precios acordados vigentes</h3>
                  {ventas360.precios_acordados.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">Sin acuerdos de precio registrados.</p>
                  ) : (
                    <table className="mt-2 w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {ventas360.precios_acordados.map((p) => (
                          <tr key={p.producto_nombre}>
                            <td className="max-w-[14rem] truncate py-1.5 text-slate-700">{p.producto_nombre}</td>
                            <td className="py-1.5 text-right font-mono text-xs text-slate-400">desde {p.vigente_desde}</td>
                            <td className="py-1.5 text-right font-mono tabular-nums text-slate-700">{formatoMXN(p.precio_acordado)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ventas recientes</h3>
                  {ventas360.ventas_recientes.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">—</p>
                  ) : (
                    <table className="mt-2 w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {ventas360.ventas_recientes.map((v) => (
                          <tr key={v.id}>
                            <td className="whitespace-nowrap py-1.5 font-mono text-xs text-slate-500">{v.fecha}</td>
                            <td className="max-w-[12rem] truncate px-2 py-1.5 text-slate-700">{v.producto_nombre}</td>
                            <td className="py-1.5">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORIGEN_BADGE[v.origen as OrigenVenta] ?? 'bg-slate-100 text-slate-600'}`}>
                                {ORIGEN_LABEL[v.origen as OrigenVenta] ?? v.origen}
                              </span>
                            </td>
                            <td className="py-1.5 text-right font-mono tabular-nums text-slate-700">{formatoMXN(v.importe)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Facturas recientes</h3>
                  {ventas360.facturas_recientes.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">Sin facturas CFDI.</p>
                  ) : (
                    <table className="mt-2 w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {ventas360.facturas_recientes.map((f) => (
                          <tr key={f.id}>
                            <td className="whitespace-nowrap py-1.5 font-mono text-xs text-slate-500">{f.fecha}</td>
                            <td className="px-2 py-1.5 text-slate-700">Folio {f.folio_interno ?? '—'}</td>
                            <td className="py-1.5 text-xs text-slate-500">{f.estado}</td>
                            <td className="py-1.5 text-right font-mono tabular-nums text-slate-700">{formatoMXN(Number(f.total))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            {/* Contactos */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                Contactos ({contactos.length})
              </h2>
              {contactos.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-400">Sin contactos. Agrega al primero con “+ Contacto”.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {contactos.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0 text-sm">
                        <p className="font-medium text-slate-700">
                          {c.nombre}
                          {c.principal && (
                            <span className="ml-2 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">Principal</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {[c.puesto, c.telefono, c.email, c.whatsapp ? `WA ${c.whatsapp}` : null].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      {puedeEditar && <ContactoEditarBoton contacto={c} />}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Actividades */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                Actividades · {pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}
              </h2>
              {actividades.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-400">Sin actividades. Registra la primera interacción.</p>
              ) : (
                <ul className="max-h-96 divide-y divide-slate-100 overflow-auto">
                  {[...pendientes, ...historialAct].slice(0, 20).map((a) => {
                    const vencida = actividadVencida(a)
                    return (
                      <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0 text-sm">
                          <p className="text-slate-700">
                            <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                              {TIPO_ACTIVIDAD_LABEL[a.tipo]}
                            </span>
                            {a.asunto}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {a.completada_at
                              ? `Completada ${fechaCorta(a.completada_at)}${a.resultado ? ` — ${a.resultado}` : ''}`
                              : a.fecha_programada
                                ? <span className={vencida ? 'font-medium text-rose-600' : ''}>Programada {fechaCorta(a.fecha_programada)}{vencida ? ' — vencida' : ''}</span>
                                : 'Pendiente sin fecha'}
                          </p>
                        </div>
                        {puedeEditar && !a.completada_at && (
                          <CompletarActividadBoton actividadId={a.id} asunto={a.asunto} />
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Oportunidades */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
              Oportunidades ({oportunidades.length})
            </h2>
            {oportunidades.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400">Sin oportunidades. Crea la primera con “+ Oportunidad”.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {oportunidades.map((o) => {
                  const vencida = cierreVencido(o)
                  return (
                    <li key={o.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                            {o.nombre}
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ETAPA_BADGE[o.etapa]}`}>
                              {ETAPA_LABEL[o.etapa]}
                            </span>
                            {vencida && (
                              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                                cierre vencido
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatoMXN(Number(o.monto_estimado))} · {o.probabilidad}% · pond.{' '}
                            {formatoMXN(valorPonderado(o.monto_estimado, o.probabilidad))}
                            {o.fecha_cierre_estimada ? ` · cierre ${o.fecha_cierre_estimada}` : ''}
                            {o.responsable_id ? ` · ${porNombre.get(o.responsable_id) ?? ''}` : ''}
                          </p>
                          {o.motivo_perdida && (
                            <p className="mt-0.5 text-xs italic text-rose-600">Motivo de pérdida: {o.motivo_perdida}</p>
                          )}
                        </div>
                        {puedeEditar && (
                          <OportunidadAcciones
                            oportunidad={o}
                            cuentaVinculada={cuenta.ventas_cliente_id !== null}
                            clientesFiscales={clientesFiscales.map((c) => ({ id: c.id, rfc: c.rfc, nombre: c.nombre }))}
                            productos={productos.map((p) => ({ id: p.id, nombre: p.nombre, linea: p.linea, unidad: p.unidad }))}
                            miembros={miembros}
                          />
                        )}
                      </div>
                      {o.items.length > 0 && (
                        <table className="mt-2 w-full max-w-xl text-xs">
                          <tbody className="divide-y divide-slate-50">
                            {o.items.map((it) => (
                              <tr key={it.id}>
                                <td className="max-w-[14rem] truncate py-1 text-slate-600">{it.producto?.nombre ?? '—'}</td>
                                <td className="py-1 text-right font-mono tabular-nums text-slate-500">
                                  {formatoNum(Number(it.cantidad), 1)} {it.producto?.unidad ?? ''}
                                </td>
                                <td className="py-1 text-right font-mono tabular-nums text-slate-500">{formatoMXN(Number(it.precio_objetivo))}</td>
                                <td className="py-1 text-right font-mono tabular-nums text-slate-700">{formatoMXN(Number(it.importe))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {o.historial.length > 1 && (
                        <p className="mt-2 text-xs text-slate-400">
                          Etapas: {o.historial.slice().reverse().map((h) => ETAPA_LABEL[h.etapa_nueva]).join(' → ')}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
