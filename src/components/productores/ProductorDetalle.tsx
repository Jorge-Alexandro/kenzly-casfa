'use client'

// Productor detail view: editable header + list of parcelas (each editable).
// Editing is gated to admin/coordinador (puedeEditar).
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type {
  ProductorDetalle as ProductorDetalleData,
  ParcelaDetalle,
  Productor,
} from '@/lib/types'
import { ESTADO_COLOR, ESTADO_LABEL } from '@/lib/types'
import { codigoCorto } from '@/lib/format'
import EditProductorModal from './EditProductorModal'
import EditParcelaModal from './EditParcelaModal'

const CULTIVO_LABEL = { cafe: 'Café', tropical: 'Tropical', mixto: 'Mixto' }

export default function ProductorDetalle({
  data,
  puedeEditar,
}: {
  data: ProductorDetalleData
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [editProductor, setEditProductor] = useState(false)
  const [editParcela, setEditParcela] = useState<ParcelaDetalle | null>(null)

  const p = data.productor
  const totalHa = data.parcelas.reduce(
    (s, x) => s + (Number(x.superficie_declarada_ha) || 0),
    0,
  )

  function onSaved() {
    setEditProductor(false)
    setEditParcela(null)
    router.refresh()
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-slate-50">
      <div className="mx-auto max-w-4xl p-6">
        <Link
          href="/productores"
          className="mb-4 inline-block text-sm text-slate-500 hover:text-slate-700"
        >
          ← Volver a productores
        </Link>

        {/* Productor header */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-800">
                {p.nombre_completo}
              </h1>
              <p className="text-sm text-slate-500">
                {p.codigo} · {CULTIVO_LABEL[p.tipo_productor]}
              </p>
            </div>
            {puedeEditar && (
              <button
                onClick={() => setEditProductor(true)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Editar
              </button>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Info label="Comunidad" value={p.comunidad} />
            <Info label="Municipio" value={p.municipio} />
            <Info label="Sexo" value={p.sexo} />
            <Info
              label="Año de ingreso"
              value={p.anio_ingreso ? String(p.anio_ingreso) : null}
            />
            <Info label="Parcelas" value={String(data.parcelas.length)} />
            <Info label="Hectáreas declaradas" value={`${totalHa.toFixed(2)} ha`} />
          </dl>
        </section>

        {/* Parcelas */}
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Parcelas ({data.parcelas.length})
        </h2>
        <div className="space-y-3">
          {data.parcelas.map((parcela) => (
            <ParcelaCard
              key={parcela.id}
              parcela={parcela}
              puedeEditar={puedeEditar}
              onEdit={() => setEditParcela(parcela)}
            />
          ))}
          {data.parcelas.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
              Este productor no tiene parcelas registradas.
            </p>
          )}
        </div>
      </div>

      {editProductor && (
        <EditProductorModal
          productor={p}
          onClose={() => setEditProductor(false)}
          onSaved={onSaved}
        />
      )}
      {editParcela && (
        <EditParcelaModal
          parcela={editParcela}
          onClose={() => setEditParcela(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

function ParcelaCard({
  parcela,
  puedeEditar,
  onEdit,
}: {
  parcela: ParcelaDetalle
  puedeEditar: boolean
  onEdit: () => void
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2.5">
          <span
            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: ESTADO_COLOR[parcela.estado_validacion] }}
            title={ESTADO_LABEL[parcela.estado_validacion]}
          />
          <div>
            <div className="font-medium text-slate-800">
              {parcela.nombre || parcela.codigo_parcela}
            </div>
            <div className="text-xs text-slate-400">
              {codigoCorto(parcela.codigo_parcela, parcela.nombre)}
            </div>
          </div>
        </div>
        {puedeEditar && (
          <button
            onClick={onEdit}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Editar
          </button>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        <Info
          label="Sup. declarada"
          value={
            parcela.superficie_declarada_ha !== null
              ? `${Number(parcela.superficie_declarada_ha).toFixed(2)} ha`
              : null
          }
        />
        <Info
          label="Área medida"
          value={
            parcela.area_calc_ha !== null
              ? `${Number(parcela.area_calc_ha).toFixed(2)} ha`
              : null
          }
        />
        <Info
          label="Diferencia"
          value={
            parcela.diferencia_pct !== null
              ? `${(Number(parcela.diferencia_pct) * 100).toFixed(1)}%`
              : null
          }
        />
        <Info label="Comunidad" value={parcela.comunidad} />
      </dl>

      {/* Productive extension (café or tropical) */}
      {parcela.tipo_cultivo === 'cafe' &&
        (parcela.superficie_arabica_ha !== null ||
          parcela.superficie_robusta_ha !== null) && (
          <div className="mt-2 flex gap-4 text-xs text-slate-500">
            {parcela.superficie_arabica_ha !== null && (
              <span>Arábica: {Number(parcela.superficie_arabica_ha).toFixed(2)} ha</span>
            )}
            {parcela.superficie_robusta_ha !== null && (
              <span>Robusta: {Number(parcela.superficie_robusta_ha).toFixed(2)} ha</span>
            )}
          </div>
        )}
      {parcela.tipo_cultivo === 'tropical' &&
        parcela.cultivos &&
        parcela.cultivos.length > 0 && (
          <div className="mt-2 text-xs text-slate-500">
            Cultivos:{' '}
            {parcela.cultivos
              .map((c) => c.cultivo)
              .filter(Boolean)
              .join(', ') || '—'}
          </div>
        )}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-700">{value || '—'}</dd>
    </div>
  )
}
