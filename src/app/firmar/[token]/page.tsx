// Página PÚBLICA de firma remota del vendedor (sin sesión).
// El vendedor abre la liga que le compartieron, ve el contrato y firma. El
// acceso lo da el token; si no existe, no se muestra nada.
import { notFound } from 'next/navigation'
import { getContratoPorToken } from '@/lib/data/contratos'
import { folioContrato, fmtDinero, ARBITRAJE_LABEL } from '@/lib/contratos/tipos'
import FirmarRemoto from '@/components/contratos/FirmarRemoto'

export const dynamic = 'force-dynamic'

export default async function FirmarPage({ params }: { params: { token: string } }) {
  const data = await getContratoPorToken(params.token)
  if (!data) notFound()
  const { contrato: c, config } = data

  const kg = Number(c.cantidad).toLocaleString('es-MX')
  const qq = c.quintales == null ? null : Number(c.quintales).toLocaleString('es-MX', { maximumFractionDigits: 3 })

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {config?.razon_social ?? 'CASFA'}
          </p>
          <h1 className="mt-1 text-lg font-semibold text-slate-800">
            Contrato de compraventa de café
          </h1>
          <p className="text-sm text-slate-500">{folioContrato(c.folio)}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Resumen
          </h2>
          <Fila k="Vendedor" v={c.vendedor_nombre} />
          <Fila k="Producto" v={`${c.especie} ${c.tipo}`} />
          <Fila k="Cantidad" v={qq ? `${kg} kg (${qq} quintales)` : `${kg} kg`} />
          <Fila k="Precio por kilo" v={fmtDinero(c.precio_unitario, c.moneda)} />
          <Fila k="Importe" v={fmtDinero(c.importe, c.moneda)} destacado />
          {c.anticipo > 0 && <Fila k="Anticipo" v={fmtDinero(c.anticipo, c.moneda)} />}
          <Fila k="Entrega" v={c.fecha_entrega ?? 'Por acordar'} />
          <Fila k="Arbitraje" v={ARBITRAJE_LABEL[c.arbitraje]} />
        </div>

        {c.calidad_texto && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Calidad pactada
            </h2>
            <p className="text-sm text-slate-600">{c.calidad_texto}</p>
          </div>
        )}

        <FirmarRemoto
          token={params.token}
          vendedorNombre={c.vendedor_nombre}
          yaFirmado={!!c.firma_vendedor_url}
        />

        <p className="text-center text-xs text-slate-400">
          Al firmar, aceptas los términos de este contrato con {config?.razon_social ?? 'CASFA'}.
        </p>
      </div>
    </div>
  )
}

function Fila({ k, v, destacado }: { k: string; v: string; destacado?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-50 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{k}</span>
      <span className={`text-right font-medium ${destacado ? 'text-orange-700' : 'text-slate-800'}`}>{v}</span>
    </div>
  )
}
