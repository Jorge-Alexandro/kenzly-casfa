'use client'

// Elige el historial EMPEZANDO por el productor (no por la parcela). El SIC
// busca "el historial de Don Alejo", no el de una parcela cuyo código nadie
// recuerda. Al elegir la parcela navega a su historial.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ParcelaLite } from '@/lib/types'
import ProductorParcelaBuscador, { type ProductorMin } from '@/components/ProductorParcelaBuscador'

export default function ParcelaPicker({
  parcelas,
  productores,
}: {
  parcelas: ParcelaLite[]
  productores: ProductorMin[]
}) {
  const router = useRouter()
  const [parcelaId, setParcelaId] = useState('')

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="mb-3 text-base font-semibold text-slate-800">
        Elige el productor para su historial
      </h1>
      <ProductorParcelaBuscador
        parcelas={parcelas}
        productores={productores}
        value={parcelaId}
        onChange={(id) => {
          setParcelaId(id)
          router.push(`/historial/${id}`)
        }}
      />
      <p className="mt-2 text-xs text-slate-400">
        Busca por nombre o código del productor; luego elige su parcela.
      </p>
    </div>
  )
}
