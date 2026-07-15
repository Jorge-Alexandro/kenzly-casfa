// Módulo Ventas — Panel de Inteligencia Comercial (Server Component).
// Lee el detalle del año desde Supabase (RLS por org), agrega en el servidor
// (UNA fuente: lib/data/ventas) y alimenta las gráficas SVG estilo reporte
// ejecutivo + tabla de catálogo. ?anio=2026 cambia el año.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import {
  getDetalles,
  getFacturas,
  getProductos,
  getStock,
  totalPorMes,
  porLinea,
  agregarPorProductoMes,
} from '@/lib/data/ventas'
import { formatoMXN, formatoNum, ORIGEN_LABEL, ORIGEN_BADGE } from '@/lib/ventas/tipos'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import GraficaEstacional from '@/components/ventas/GraficaEstacional'
import GraficaDona from '@/components/ventas/GraficaDona'
import GraficaTopProductos from '@/components/ventas/GraficaTopProductos'
import GraficaValorVolumen from '@/components/ventas/GraficaValorVolumen'
import TablaCatalogo from '@/components/ventas/TablaCatalogo'
import BackupVentas from '@/components/ventas/BackupVentas'

export const dynamic = 'force-dynamic'

// Encabezado de sección estilo reporte: punto naranja + título en mayúsculas.
function TituloSeccion({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <div className="mb-4">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-800">
        <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" />
        {titulo}
      </h2>
      {subtitulo && <p className="mt-1 text-sm text-slate-500">{subtitulo}</p>}
    </div>
  )
}

export default async function VentasPage({
  searchParams,
}: {
  searchParams?: { anio?: string }
}) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const anio = Number(searchParams?.anio) || new Date().getFullYear()
  const [detalles, facturas, stock, productos] = await Promise.all([
    getDetalles(anio),
    getFacturas(anio),
    getStock(),
    getProductos(),
  ])

  const meses = totalPorMes(detalles)
  const lineas = porLinea(detalles)
  const matriz = agregarPorProductoMes(detalles)
  const totalAnio = meses.reduce((a, b) => a + b, 0)
  const alertas = detalles.filter((d) => d.alerta_precio)
  const ultimoMesConVenta = meses.reduce((max, v, i) => (v > 0 ? i + 1 : max), 1)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre}>
        <Link
          href="/ventas/importar"
          className="hidden whitespace-nowrap rounded-md border border-orange-600 px-3 py-1.5 text-sm font-medium text-orange-700 transition hover:bg-orange-50 sm:block"
        >
          Importar CFDI
        </Link>
        <Link
          href="/ventas/captura"
          className="whitespace-nowrap rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700"
        >
          + Venta
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold text-slate-800">Ventas · Reporte {anio}</h1>
              <p className="text-sm text-slate-500">
                {detalles.length} venta{detalles.length === 1 ? '' : 's'} · {facturas.length} factura
                {facturas.length === 1 ? '' : 's'} CFDI · producto terminado
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-md border border-slate-300 bg-white p-0.5 text-sm">
                {[anio - 1, anio, anio + 1].map((a) => (
                  <Link
                    key={a}
                    href={`/ventas?anio=${a}`}
                    className={`rounded px-2.5 py-1 font-medium transition ${
                      a === anio
                        ? 'bg-orange-50 text-orange-700'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {a}
                  </Link>
                ))}
              </div>
              <a
                href={`/api/ventas/export?anio=${anio}&mes=${ultimoMesConVenta}`}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Exportar Planilla
              </a>
              {/* Backup = volcado íntegro de la info comercial → solo admin
                  (el API además lo rechaza con 403 en servidor) */}
              {result.session.rol === 'admin' && <BackupVentas />}
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Importe del año</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-800">{formatoMXN(totalAnio)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Líneas con venta</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-800">{lineas.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Productos vendidos</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-slate-800">{matriz.filter((m) => m.total_importe > 0).length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Alertas de precio</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${alertas.length > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                {alertas.length}
              </p>
            </div>
          </div>

          {/* 1 — Análisis de crecimiento estacional */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <TituloSeccion
              titulo={`Análisis de crecimiento estacional: ingresos mensuales ($ MXN)`}
              subtitulo="Identificación de patrones estacionales y curva de rendimiento financiero."
            />
            <GraficaEstacional meses={meses} />
          </div>

          {/* 2 — Participación + Top productos */}
          <div className="grid gap-5 xl:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-5 xl:col-span-2">
              <TituloSeccion
                titulo="Participación por línea de producto"
                subtitulo="Porcentaje de la facturación consolidada por línea de negocio."
              />
              <GraficaDona lineas={lineas} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 xl:col-span-3">
              <TituloSeccion
                titulo="Top productos por importe acumulado"
                subtitulo="Los productos estrella de mayor volumen financiero (Pareto 80/20)."
              />
              <GraficaTopProductos
                productos={matriz.map((m) => ({ nombre: m.nombre, importe: m.total_importe }))}
              />
            </div>
          </div>

          {/* 3 — Comparativa valor vs volumen */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <TituloSeccion
              titulo="Comparativa: ventas ($ MXN) vs. volumen físico (KG) por línea"
              subtitulo="Cruza el valor facturado contra el volumen físico comercializado — margen de valor por kilogramo."
            />
            <GraficaValorVolumen lineas={lineas} />
          </div>

          {/* 4 — Tabla de catálogo */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <TituloSeccion
              titulo="Tabla de catálogo (Top 10)"
              subtitulo="Reporte detallado de los productos de mayor facturación."
            />
            <TablaCatalogo matriz={matriz} totalCatalogo={productos.length} />
          </div>

          {/* 5 — Inventario + últimas ventas */}
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                Inventario de producto terminado
              </h2>
              {stock.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-400">
                  Sin registros. El inventario se descuenta con cada venta manual.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {stock.map((s) => (
                      <tr key={s.producto_id}>
                        <td className="max-w-[20rem] truncate px-4 py-2 text-slate-700">{s.producto?.nombre ?? '—'}</td>
                        <td className={`px-4 py-2 text-right font-mono tabular-nums ${Number(s.cantidad_disponible) < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                          {formatoNum(Number(s.cantidad_disponible), 3)} {s.unidad}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                Últimas ventas
              </h2>
              {detalles.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-400">
                  Aún no hay ventas en {anio}. Importa CFDI o captura una venta.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {detalles.slice(0, 8).map((d) => (
                      <tr key={d.id}>
                        <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-slate-500">{d.fecha}</td>
                        <td className="max-w-[14rem] truncate px-2 py-2 text-slate-700">{d.producto?.nombre ?? '—'}</td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORIGEN_BADGE[d.origen]}`}>
                            {ORIGEN_LABEL[d.origen]}
                          </span>
                          {d.alerta_precio && (
                            <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              ⚠ precio
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-700">
                          {formatoMXN(Number(d.importe))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
