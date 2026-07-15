'use client'

// Acciones por oportunidad en la ficha 360°: mover de etapa y editar.
import { useState } from 'react'
import CambiarEtapaModal, { type ClienteFiscalOpcion } from './CambiarEtapaModal'
import OportunidadFormModal, { type ProductoOpcion } from './OportunidadFormModal'
import type { MiembroOrg, OportunidadRow } from '@/lib/crm/tipos'

export default function OportunidadAcciones({
  oportunidad,
  cuentaVinculada,
  clientesFiscales,
  productos,
  miembros,
}: {
  oportunidad: OportunidadRow
  cuentaVinculada: boolean
  clientesFiscales: ClienteFiscalOpcion[]
  productos: ProductoOpcion[]
  miembros: MiembroOrg[]
}) {
  const [modal, setModal] = useState<'etapa' | 'editar' | null>(null)

  const btn = 'rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700'

  return (
    <>
      <div className="flex shrink-0 gap-1">
        <button onClick={() => setModal('etapa')} className={btn}>Mover etapa</button>
        <button onClick={() => setModal('editar')} className={btn}>Editar</button>
      </div>
      {modal === 'etapa' && (
        <CambiarEtapaModal
          abierto
          onCerrar={() => setModal(null)}
          oportunidad={oportunidad}
          cuentaVinculada={cuentaVinculada}
          clientesFiscales={clientesFiscales}
        />
      )}
      {modal === 'editar' && (
        <OportunidadFormModal
          abierto
          onCerrar={() => setModal(null)}
          cuentas={[]}
          productos={productos}
          miembros={miembros}
          oportunidad={oportunidad}
        />
      )}
    </>
  )
}
