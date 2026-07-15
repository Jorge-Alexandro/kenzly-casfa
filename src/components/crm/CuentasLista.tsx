'use client'

// Lista de cuentas con buscador y filtros (client-side: el padrón comercial de
// CASFA es chico; si crece, se pagina en servidor). Alta/edición por modal.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import CuentaFormModal from './CuentaFormModal'
import { SELECT, fechaCorta } from './ui'
import {
  ESTATUS_CUENTA_LABEL,
  TIPO_CUENTA_BADGE,
  TIPO_CUENTA_LABEL,
  nombreMiembro,
  type CuentaRow,
  type MiembroOrg,
} from '@/lib/crm/tipos'

export default function CuentasLista({
  cuentas,
  miembros,
  puedeEditar,
  abrirNueva = false,
}: {
  cuentas: CuentaRow[]
  miembros: MiembroOrg[]
  puedeEditar: boolean
  abrirNueva?: boolean
}) {
  const [busqueda, setBusqueda] = useState('')
  const [tipo, setTipo] = useState('')
  const [estatus, setEstatus] = useState('')
  const [responsable, setResponsable] = useState('')
  const [nuevaAbierta, setNuevaAbierta] = useState(abrirNueva)
  const [editando, setEditando] = useState<CuentaRow | null>(null)

  const porNombre = new Map(miembros.map((m) => [m.id, nombreMiembro(m)]))

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return cuentas.filter((c) => {
      if (tipo && c.tipo !== tipo) return false
      if (estatus && c.estatus !== estatus) return false
      if (responsable && c.responsable_id !== responsable) return false
      if (!q) return true
      return [c.nombre, c.nombre_comercial, c.segmento, c.email, c.telefono]
        .some((v) => v?.toLowerCase().includes(q))
    })
  }, [cuentas, busqueda, tipo, estatus, responsable])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, segmento, correo…"
          className="min-w-[14rem] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
        />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={`${SELECT} mt-0 w-auto`} aria-label="Filtrar por tipo">
          <option value="">Tipo: todos</option>
          {Object.entries(TIPO_CUENTA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={estatus} onChange={(e) => setEstatus(e.target.value)} className={`${SELECT} mt-0 w-auto`} aria-label="Filtrar por estatus">
          <option value="">Estatus: todos</option>
          {Object.entries(ESTATUS_CUENTA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className={`${SELECT} mt-0 w-auto`} aria-label="Filtrar por responsable">
          <option value="">Responsable: todos</option>
          {miembros.map((m) => <option key={m.id} value={m.id}>{nombreMiembro(m)}</option>)}
        </select>
        {puedeEditar && (
          <button onClick={() => setNuevaAbierta(true)} className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-orange-700">
            + Cuenta
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filtradas.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">
            {cuentas.length === 0
              ? 'Aún no hay cuentas. Crea el primer prospecto — no necesita RFC.'
              : 'Sin coincidencias con los filtros.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Cuenta</th>
                  <th className="px-2 py-2.5 font-medium">Tipo</th>
                  <th className="hidden px-2 py-2.5 font-medium md:table-cell">Segmento</th>
                  <th className="hidden px-2 py-2.5 font-medium lg:table-cell">Estatus</th>
                  <th className="hidden px-2 py-2.5 font-medium md:table-cell">Responsable</th>
                  <th className="px-2 py-2.5 font-medium">Últ. interacción</th>
                  {puedeEditar && <th className="px-2 py-2.5" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradas.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="max-w-[16rem] px-4 py-2.5">
                      <Link href={`/crm/cuentas/${c.id}`} className="block truncate font-medium text-slate-800 hover:text-orange-700">
                        {c.nombre}
                      </Link>
                      {c.nombre_comercial && <p className="truncate text-xs text-slate-400">{c.nombre_comercial}</p>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_CUENTA_BADGE[c.tipo]}`}>
                        {TIPO_CUENTA_LABEL[c.tipo]}
                      </span>
                    </td>
                    <td className="hidden max-w-[10rem] truncate px-2 py-2.5 text-slate-600 md:table-cell">{c.segmento ?? '—'}</td>
                    <td className="hidden px-2 py-2.5 text-slate-600 lg:table-cell">{ESTATUS_CUENTA_LABEL[c.estatus]}</td>
                    <td className="hidden max-w-[10rem] truncate px-2 py-2.5 text-slate-600 md:table-cell">
                      {c.responsable_id ? porNombre.get(c.responsable_id) ?? '—' : '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 font-mono text-xs text-slate-500">
                      {fechaCorta(c.ultima_actividad)}
                    </td>
                    {puedeEditar && (
                      <td className="px-2 py-2.5 text-right">
                        <button onClick={() => setEditando(c)} className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
                          Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400">{filtradas.length} de {cuentas.length} cuentas</p>

      {nuevaAbierta && (
        <CuentaFormModal abierto onCerrar={() => setNuevaAbierta(false)} miembros={miembros} />
      )}
      {editando && (
        <CuentaFormModal abierto onCerrar={() => setEditando(null)} miembros={miembros} cuenta={editando} />
      )}
    </div>
  )
}
