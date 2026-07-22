// Módulo 8 — Contratos: detalle (Server Component).
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import { getContrato, getConfig } from '@/lib/data/contratos'
import {
  CONTRATO_ESTADO_LABEL,
  CONTRATO_ESTADO_BADGE,
  ARBITRAJE_LABEL,
  fmtDinero,
  folioContrato,
} from '@/lib/contratos/tipos'
import { esSupervisor } from '@/lib/acopio/estado'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import FirmasContrato from '@/components/contratos/FirmasContrato'
import BorrarContrato from '@/components/contratos/BorrarContrato'

export const dynamic = 'force-dynamic'

export default async function ContratoPage({ params }: { params: { id: string } }) {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const [c, config] = await Promise.all([getContrato(params.id), getConfig()])
  if (!c) notFound()

  const puedeGestionar = esSupervisor(result.session.rol)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {/* Encabezado */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-slate-800">{folioContrato(c.folio)}</h1>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CONTRATO_ESTADO_BADGE[c.estado]}`}>
                  {CONTRATO_ESTADO_LABEL[c.estado]}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-600">{c.vendedor_nombre}</p>
              <p className="text-xs text-slate-400">
                {c.fecha} · {c.especie} {c.tipo}
                {[c.comunidad, c.municipio].filter(Boolean).length > 0 &&
                  ` · ${[c.comunidad, c.municipio].filter(Boolean).join(', ')}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={`/api/contratos/${c.id}/pdf`}
                className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
              >
                ↓ Descargar contrato (PDF)
              </a>
              {puedeGestionar && <BorrarContrato id={c.id} folio={c.folio} />}
              <Link href="/contratos" className="text-sm text-slate-500 hover:text-slate-700">← Volver</Link>
            </div>
          </div>

          {/* Términos */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Dato label="Kilos" value={`${Number(c.cantidad).toLocaleString('es-MX')} kg`} />
            <Dato
              label="Quintales (sacos)"
              value={c.quintales == null ? '—' : Number(c.quintales).toLocaleString('es-MX', { maximumFractionDigits: 3 })}
            />
            <Dato label="Precio / kilo" value={fmtDinero(c.precio_unitario, c.moneda)} />
            <Dato label="Importe" value={fmtDinero(c.importe, c.moneda)} destacado />
            <Dato label="Anticipo" value={fmtDinero(c.anticipo, c.moneda)} />
          </div>

          <Bloque titulo="Términos">
            <Fila k="Producto" v={`${c.especie} ${c.tipo}`} />
            <Fila k="Fecha del contrato" v={c.fecha} />
            <Fila k="Fecha de entrega" v={c.fecha_entrega ?? '—'} />
            <Fila k="Ciclo" v={c.ciclo ?? '—'} />
            <Fila k="Arbitraje" v={ARBITRAJE_LABEL[c.arbitraje]} />
            <Fila k="Lugar de firma" v={c.lugar_firma ?? '—'} />
          </Bloque>

          <Bloque titulo="Vendedor">
            <Fila k="Nombre" v={c.vendedor_nombre} />
            <Fila k="Domicilio" v={c.vendedor_domicilio ?? '—'} />
            <Fila k="CURP" v={c.vendedor_curp ?? '—'} />
            <Fila k="RFC" v={c.vendedor_rfc ?? '—'} />
            <Fila k="Teléfono" v={c.vendedor_telefono ?? '—'} />
          </Bloque>

          {(c.calidad_texto || c.costalera_texto || c.condiciones_texto || c.arbitraje_texto) && (
            <Bloque titulo="Cláusulas">
              {c.calidad_texto && <Clausula titulo="Calidad" texto={c.calidad_texto} />}
              {c.costalera_texto && <Clausula titulo="Costalera y etiquetado" texto={c.costalera_texto} />}
              {c.condiciones_texto && <Clausula titulo="Condiciones" texto={c.condiciones_texto} />}
              {c.arbitraje_texto && <Clausula titulo="Arbitraje" texto={c.arbitraje_texto} />}
            </Bloque>
          )}

          {c.observaciones && (
            <Bloque titulo="Observaciones">
              <p className="text-sm text-slate-600">{c.observaciones}</p>
            </Bloque>
          )}

          {/* Firma electrónica: las dos partes firman en pantalla */}
          <FirmasContrato
            contrato={c}
            representante={config?.representante_nombre ?? 'Representante Legal'}
            firmaRepresentanteGuardada={config?.firma_representante_url ?? null}
            puedeGestionar={puedeGestionar}
          />
        </div>
      </div>
    </div>
  )
}

function Dato({ label, value, destacado }: { label: string; value: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destacado ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${destacado ? 'text-orange-700' : 'text-slate-800'}`}>
        {value}
      </div>
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-500">{k}</span>
      <span className="text-right font-medium text-slate-800">{v}</span>
    </div>
  )
}

function Clausula({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <div className="text-xs font-semibold text-slate-600">{titulo}</div>
      <p className="mt-0.5 text-sm text-slate-600">{texto}</p>
    </div>
  )
}
