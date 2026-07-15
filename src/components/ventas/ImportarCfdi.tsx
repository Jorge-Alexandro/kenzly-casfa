'use client'

// Importador de CFDI 4.0 (browser-side, sin backend intermedio de parseo):
// 1) el usuario suelta uno o varios .xml del SAT, 2) se parsean aquí con
// DOMParser vía lib/ventas/cfdi.mjs y se muestra EL RESUMEN COMPLETO de lo
// que se va a guardar, 3) sólo al confirmar se envía cada XML al API, que
// re-parsea (autoridad), archiva el XML en Storage e inserta factura+detalle.
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parsearCfdi, sumaConceptos } from '@/lib/ventas/cfdi.mjs'
import type { FacturaCfdi } from '@/lib/ventas/cfdi.mjs'
import { formatoMXN, formatoNum } from '@/lib/ventas/tipos'

interface ArchivoParseado {
  nombreArchivo: string
  xml: string
  factura: FacturaCfdi | null
  error: string | null
  resultado?: { ok: boolean; mensaje: string }
}

export default function ImportarCfdi() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [archivos, setArchivos] = useState<ArchivoParseado[]>([])
  const [guardando, setGuardando] = useState(false)
  const [terminado, setTerminado] = useState(false)

  async function onArchivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    const nuevos: ArchivoParseado[] = []
    for (const archivo of Array.from(lista)) {
      const xml = await archivo.text()
      try {
        nuevos.push({ nombreArchivo: archivo.name, xml, factura: parsearCfdi(xml), error: null })
      } catch (e) {
        nuevos.push({ nombreArchivo: archivo.name, xml, factura: null, error: (e as Error).message })
      }
    }
    setArchivos((prev) => [...prev, ...nuevos])
    setTerminado(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function guardarTodo() {
    setGuardando(true)
    const pendientes = archivos.filter((a) => a.factura && !a.resultado?.ok)
    for (const a of pendientes) {
      try {
        const res = await fetch('/api/ventas/facturas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ xml: a.xml }),
        })
        const json = await res.json()
        a.resultado = res.ok
          ? { ok: true, mensaje: `Guardada (${json.conceptos} concepto${json.conceptos === 1 ? '' : 's'})` }
          : { ok: false, mensaje: json.error ?? `Error ${res.status}` }
      } catch (e) {
        a.resultado = { ok: false, mensaje: (e as Error).message }
      }
      setArchivos((prev) => [...prev])
    }
    setGuardando(false)
    setTerminado(true)
    router.refresh()
  }

  const validas = archivos.filter((a) => a.factura)
  const porGuardar = validas.filter((a) => !a.resultado?.ok)
  const totalPorGuardar = porGuardar.reduce((s, a) => s + (a.factura?.total ?? 0), 0)

  return (
    <div className="space-y-4">
      <label
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center transition hover:border-orange-400 hover:bg-orange-50/40"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          onArchivos(e.dataTransfer.files)
        }}
      >
        <p className="text-sm font-medium text-slate-700">
          Arrastra aquí los .xml del SAT (CFDI 4.0) o haz clic para elegirlos
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Se muestran antes de guardar; nada se inserta sin tu confirmación.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xml,text/xml"
          multiple
          className="hidden"
          onChange={(e) => onArchivos(e.target.files)}
        />
      </label>

      {archivos.length > 0 && (
        <div className="space-y-3">
          {archivos.map((a, idx) => (
            <div key={`${a.nombreArchivo}-${idx}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {a.factura
                      ? `Factura ${a.factura.folioInterno ?? 's/n'} · ${a.factura.fecha}`
                      : a.nombreArchivo}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {a.factura
                      ? `${a.factura.receptor.nombre} (${a.factura.receptor.rfc})`
                      : a.nombreArchivo}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {a.factura && (
                    <span className="text-sm font-semibold tabular-nums text-slate-800">
                      {formatoMXN(a.factura.total)}
                    </span>
                  )}
                  {a.error && (
                    <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                      {a.error}
                    </span>
                  )}
                  {a.resultado && (
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        a.resultado.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {a.resultado.mensaje}
                    </span>
                  )}
                  <button
                    onClick={() => setArchivos((prev) => prev.filter((_, i) => i !== idx))}
                    className="rounded-md px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Quitar archivo"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {a.factura && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Concepto</th>
                        <th className="px-3 py-2">Línea de negocio</th>
                        <th className="px-3 py-2 text-right">Cantidad</th>
                        <th className="px-3 py-2 text-right">P. unitario</th>
                        <th className="px-3 py-2 text-right">Importe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {a.factura.conceptos.map((c, i) => (
                        <tr key={i}>
                          <td className="max-w-[22rem] truncate px-3 py-2 text-slate-700">{c.descripcion}</td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                              {c.linea}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatoNum(c.cantidad, 3)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatoMXN(c.valorUnitario)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatoMXN(c.importe)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {Math.abs(sumaConceptos(a.factura) - a.factura.total) > 0.01 && (
                    <p className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-700">
                      La suma de conceptos ({formatoMXN(sumaConceptos(a.factura))}) difiere del total del
                      comprobante ({formatoMXN(a.factura.total)}) — normal si hay impuestos o descuentos.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          {porGuardar.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
              <p className="text-sm text-orange-900">
                Se guardarán <strong>{porGuardar.length}</strong> factura{porGuardar.length === 1 ? '' : 's'} por{' '}
                <strong>{formatoMXN(totalPorGuardar)}</strong>. Los XML originales se archivan en el
                expediente (bucket cfdi-xml).
              </p>
              <button
                onClick={guardarTodo}
                disabled={guardando}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : `Confirmar y guardar (${porGuardar.length})`}
              </button>
            </div>
          )}
          {terminado && porGuardar.every((a) => a.resultado) && (
            <p className="text-sm text-slate-500">
              Importación terminada. Revisa el estado de cada factura arriba.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
