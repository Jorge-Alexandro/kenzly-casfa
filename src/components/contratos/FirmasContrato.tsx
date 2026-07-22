'use client'

// Firma electrónica del contrato: las dos partes firman en pantalla (dedo o
// mouse) y la firma se estampa en el PDF. Con las dos firmas el contrato pasa
// a FIRMADO.
//
// La firma de CASFA se pre-carga con la que está guardada en la configuración
// (la de Adrián), para no tener que redibujarla en cada contrato.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SignaturePad from '@/components/fichas/SignaturePad'
import type { ContratoDetalle } from '@/lib/contratos/tipos'

export default function FirmasContrato({
  contrato,
  representante,
  firmaRepresentanteGuardada,
}: {
  contrato: ContratoDetalle
  representante: string
  firmaRepresentanteGuardada: string | null
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firmaVendedor, setFirmaVendedor] = useState<string | null>(contrato.firma_vendedor_url)
  const [firmaComprador, setFirmaComprador] = useState<string | null>(
    contrato.firma_comprador_url ?? firmaRepresentanteGuardada,
  )

  async function guardar() {
    setError(null)
    setGuardando(true)
    try {
      const res = await fetch(`/api/contratos/${contrato.id}/firmas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firma_vendedor: firmaVendedor,
          firma_comprador: firmaComprador,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron guardar las firmas')
      setAbierto(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setGuardando(false)
    }
  }

  const nFirmas = (contrato.firma_vendedor_url ? 1 : 0) + (contrato.firma_comprador_url ? 1 : 0)

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Firmas electrónicas
          </h2>
          <p className="text-xs text-slate-400">
            {nFirmas}/2 firmas
            {nFirmas === 2
              ? ' · el contrato quedó firmado'
              : ' · con las dos, el contrato pasa a firmado'}
          </p>
        </div>
        <button
          onClick={() => setAbierto((v) => !v)}
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
        >
          {abierto ? 'Cerrar' : nFirmas === 0 ? 'Firmar' : 'Editar firmas'}
        </button>
      </div>

      {/* Vista de las firmas ya guardadas */}
      {!abierto && nFirmas > 0 && (
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <FirmaGuardada
            url={contrato.firma_vendedor_url}
            nombre={contrato.vendedor_nombre}
            rol="EL VENDEDOR"
            fecha={contrato.firmado_vendedor_at}
          />
          <FirmaGuardada
            url={contrato.firma_comprador_url}
            nombre={representante}
            rol="POR EL COMPRADOR"
            fecha={contrato.firmado_comprador_at}
          />
        </div>
      )}

      {abierto && (
        <div className="space-y-5 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Firma del vendedor — {contrato.vendedor_nombre}
              </h3>
              <SignaturePad value={firmaVendedor} onChange={setFirmaVendedor} />
            </div>
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Firma por CASFA — {representante}
              </h3>
              <SignaturePad value={firmaComprador} onChange={setFirmaComprador} />
              {firmaRepresentanteGuardada && !contrato.firma_comprador_url && (
                <p className="mt-1 text-xs text-slate-400">
                  Se cargó la firma guardada en la configuración.
                </p>
              )}
            </div>
          </div>

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <div className="flex justify-end">
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar firmas'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function FirmaGuardada({
  url,
  nombre,
  rol,
  fecha,
}: {
  url: string | null
  nombre: string
  rol: string
  fecha: string | null
}) {
  return (
    <div className="text-center">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`Firma de ${nombre}`} className="mx-auto h-16 object-contain" />
      ) : (
        <div className="flex h-16 items-center justify-center text-xs text-slate-400">
          Sin firmar
        </div>
      )}
      <div className="mt-1 border-t border-slate-300 pt-1">
        <p className="text-sm font-semibold text-slate-800">{nombre}</p>
        <p className="text-xs text-slate-500">{rol}</p>
        {fecha && <p className="text-xs text-slate-400">{fecha.slice(0, 10)}</p>}
      </div>
    </div>
  )
}
