'use client'

// Barra de acciones de la ficha 360° (solo editores): editar cuenta, agregar
// contacto/oportunidad/actividad y vincular cliente fiscal.
import { useState } from 'react'
import CuentaFormModal from './CuentaFormModal'
import ContactoFormModal from './ContactoFormModal'
import OportunidadFormModal, { type ProductoOpcion } from './OportunidadFormModal'
import ActividadFormModal from './ActividadFormModal'
import VincularClienteModal from './VincularClienteModal'
import type { ClienteFiscalOpcion } from './CambiarEtapaModal'
import { BTN_SECUNDARIO } from './ui'
import type { CuentaRow, MiembroOrg } from '@/lib/crm/tipos'

type ModalAbierto = 'editar' | 'contacto' | 'oportunidad' | 'actividad' | 'vincular' | null

export default function CuentaAcciones({
  cuenta,
  miembros,
  productos,
  oportunidadesAbiertas,
  clientesFiscales,
}: {
  cuenta: CuentaRow
  miembros: MiembroOrg[]
  productos: ProductoOpcion[]
  oportunidadesAbiertas: { id: string; nombre: string }[]
  clientesFiscales: ClienteFiscalOpcion[]
}) {
  const [modal, setModal] = useState<ModalAbierto>(null)
  const cerrar = () => setModal(null)

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setModal('editar')} className={BTN_SECUNDARIO}>Editar cuenta</button>
        <button onClick={() => setModal('contacto')} className={BTN_SECUNDARIO}>+ Contacto</button>
        <button onClick={() => setModal('oportunidad')} className={BTN_SECUNDARIO}>+ Oportunidad</button>
        <button onClick={() => setModal('actividad')} className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-700">
          + Actividad
        </button>
        {!cuenta.ventas_cliente_id && (
          <button onClick={() => setModal('vincular')} className={BTN_SECUNDARIO}>
            Vincular cliente fiscal
          </button>
        )}
      </div>

      {modal === 'editar' && (
        <CuentaFormModal abierto onCerrar={cerrar} miembros={miembros} cuenta={cuenta} />
      )}
      {modal === 'contacto' && (
        <ContactoFormModal abierto onCerrar={cerrar} cuentaId={cuenta.id} />
      )}
      {modal === 'oportunidad' && (
        <OportunidadFormModal
          abierto
          onCerrar={cerrar}
          cuentas={[{ id: cuenta.id, nombre: cuenta.nombre }]}
          cuentaFija={cuenta.id}
          productos={productos}
          miembros={miembros}
        />
      )}
      {modal === 'actividad' && (
        <ActividadFormModal
          abierto
          onCerrar={cerrar}
          cuentaId={cuenta.id}
          oportunidades={oportunidadesAbiertas}
          miembros={miembros}
        />
      )}
      {modal === 'vincular' && (
        <VincularClienteModal
          abierto
          onCerrar={cerrar}
          cuentaId={cuenta.id}
          nombreCuenta={cuenta.nombre}
          clientesFiscales={clientesFiscales}
        />
      )}
    </>
  )
}
