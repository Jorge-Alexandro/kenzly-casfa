'use client'

// Evidencias de la entrada: fotos y firmas. Van APARTE del análisis de calidad y
// DESPUÉS de las pesadas, porque ése es el orden real del almacén: primero se
// pesa todo el café, y sólo cuando ya hay totales se firma el recibo.
//
// Las imágenes se mandan como data URL; el servidor las sube a Storage y guarda
// la URL pública. Sólo png/jpg: son los formatos que el generador del recibo
// (react-pdf) sabe incrustar.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SignaturePad from '@/components/fichas/SignaturePad'
import type { EntradaDetalle } from '@/lib/acopio/tipos'

const FOTOS = [
  ['foto_calidad', 'Foto análisis de calidad', 'foto_calidad_url'],
  ['foto_muestra', 'Foto muestra', 'foto_muestra_url'],
  ['foto_libreta', 'Foto de la libreta', 'foto_libreta_url'],
  ['foto_libreta2', 'Foto de la libreta 2', 'foto_libreta2_url'],
] as const

export default function Evidencias({ entrada }: { entrada: EntradaDetalle }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firmaReceptor, setFirmaReceptor] = useState<string | null>(entrada.firma_receptor_url)
  const [firmaProveedor, setFirmaProveedor] = useState<string | null>(entrada.firma_proveedor_url)
  const [fotos, setFotos] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(FOTOS.map(([k, , col]) => [k, entrada[col] as string | null])),
  )

  async function leerArchivo(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.onerror = rej
      r.readAsDataURL(file)
    })
  }

  async function guardar() {
    setError(null)
    setGuardando(true)
    try {
      const res = await fetch(`/api/acopio/entradas/${entrada.id}/calidad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firma_receptor: firmaReceptor,
          firma_proveedor: firmaProveedor,
          ...fotos,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar')
      setAbierto(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setGuardando(false)
    }
  }

  const nFotos = FOTOS.filter(([, , col]) => entrada[col]).length
  const nFirmas = (entrada.firma_receptor_url ? 1 : 0) + (entrada.firma_proveedor_url ? 1 : 0)

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Fotos y firmas
          </h2>
          <p className="text-xs text-slate-400">
            {nFotos}/4 fotos · {nFirmas}/2 firmas
            {nFirmas < 2 && ' · las dos firmas son necesarias para completar la entrada'}
          </p>
        </div>
        <button
          onClick={() => setAbierto((v) => !v)}
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
        >
          {abierto ? 'Cerrar' : 'Capturar'}
        </button>
      </div>

      {abierto && (
        <div className="space-y-5 p-4">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Fotos</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {FOTOS.map(([k, label]) => (
                <div key={k}>
                  <span className="mb-1 block text-xs text-slate-500">{label}</span>
                  {fotos[k] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fotos[k] as string}
                      alt={label}
                      className="mb-1 h-24 w-full rounded border border-slate-200 object-cover"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    capture="environment"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const dataUrl = await leerArchivo(f)
                      setFotos((p) => ({ ...p, [k]: dataUrl }))
                    }}
                    className="w-full text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Firma del receptor (almacén / pesador)
              </h3>
              <SignaturePad value={firmaReceptor} onChange={setFirmaReceptor} />
            </div>
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Firma del proveedor / chofer
              </h3>
              <SignaturePad value={firmaProveedor} onChange={setFirmaProveedor} />
            </div>
          </div>

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <div className="flex justify-end">
            <button
              onClick={guardar}
              disabled={guardando}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar fotos y firmas'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
