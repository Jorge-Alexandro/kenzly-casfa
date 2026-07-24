// Módulo 9 — Salidas (programación de entregas). Server Component.
// El operativo registra la salida física; las columnas de dinero (precio de
// venta) sólo se renderizan para Contabilidad — y la RLS de salida_venta las
// deja vacías para cualquier otro rol.
import { redirect } from 'next/navigation'
import { getSessionResult } from '@/lib/session'
import { getSalidasConVenta } from '@/lib/data/salidas'
import { getProductosCatalogo } from '@/lib/data/acopio'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'
import SalidasPanel from '@/components/salidas/SalidasPanel'

export const dynamic = 'force-dynamic'

export default async function SalidasPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  const { rol, orgNombre } = result.session
  const puedeVerDinero = rol === 'admin' || rol === 'contador'

  const [salidas, catalogo] = await Promise.all([getSalidasConVenta(), getProductosCatalogo()])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={orgNombre} rol={rol} />
      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Salidas del almacén</h1>
            <p className="text-sm text-slate-500">
              {salidas.length} salida{salidas.length === 1 ? '' : 's'} · guía, cliente, cantidad y
              responsable
              {!puedeVerDinero && ' · el precio de venta lo lleva Contabilidad'}
            </p>
          </div>
          <SalidasPanel
            salidas={salidas}
            catalogo={catalogo}
            puedeVerDinero={puedeVerDinero}
          />
        </div>
      </div>
    </div>
  )
}
