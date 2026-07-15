'use client'

// Importador de los formatos de acopio (browser-side, como ImportarCfdi):
// 1) el encargado suelta los .xlsx, 2) se parsean aquí y se muestra el RESUMEN
// COMPLETO con sus descuadres, 3) sólo al confirmar se envían al API, que
// re-parsea (autoridad) e inserta.
//
// Los avisos se muestran ANTES de guardar, no después: la gracia es que quien
// sube el archivo vea el descuadre mientras todavía puede ir a preguntarle a
// bodega, no cuando ya está en la base.
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parsearMaquila, parsearInventario, parsearSalidas } from '@/lib/maquila/formato.mjs'
import { validarMaquila, validarInventario, validarSalidas } from '@/lib/maquila/validacion.mjs'
import type { CorteMaquila, CorteInventario, HojaSalidas } from '@/lib/maquila/formato.mjs'
import type { Aviso } from '@/lib/maquila/validacion.mjs'

type Parseado =
  | { tipo: 'maquila'; corte: CorteMaquila }
  | { tipo: 'inventario'; corte: CorteInventario }
  | { tipo: 'salidas'; hoja: HojaSalidas }

interface Archivo {
  nombre: string
  b64: string
  parseado: Parseado | null
  avisos: Aviso[]
  error: string | null
  resultado?: { ok: boolean; mensaje: string }
}

const num = (n: number, dec = 1) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec })
const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(2)}%`)

/** Bytes → base64, por trozos: un .xlsx de 4 MB revienta la pila de una sola. */
function aBase64(bytes: Uint8Array): string {
  const TROZO = 0x8000
  let s = ''
  for (let i = 0; i < bytes.length; i += TROZO) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + TROZO)))
  }
  return btoa(s)
}

export default function ImportarFormatos() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [archivos, setArchivos] = useState<Archivo[]>([])
  const [guardando, setGuardando] = useState(false)

  async function onArchivos(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    const nuevos: Archivo[] = []

    for (const archivo of Array.from(lista)) {
      const bytes = new Uint8Array(await archivo.arrayBuffer())
      const b64 = aBase64(bytes)
      const base: Archivo = { nombre: archivo.name, b64, parseado: null, avisos: [], error: null }

      // Se prueba cada formato por su CONTENIDO, no por el nombre del archivo:
      // llegan renombrados a mano y el nombre miente. Gana el que no truene.
      try {
        if (/INVENTARIO/i.test(archivo.name)) {
          const corte = parsearInventario(bytes, archivo.name)
          nuevos.push({ ...base, parseado: { tipo: 'inventario', corte }, avisos: validarInventario(corte) })
          continue
        }
        try {
          // El MASTER es el único con hoja SALIDA. De él sólo se toma esa hoja:
          // sus hojas 'MAQUILA 1..19' son copias a mano de los formatos.
          const hoja = parsearSalidas(bytes, archivo.name)
          nuevos.push({ ...base, parseado: { tipo: 'salidas', hoja }, avisos: validarSalidas(hoja) })
          continue
        } catch {
          /* no es el MASTER: se intenta como corte */
        }
        const corte = parsearMaquila(bytes, archivo.name)
        nuevos.push({ ...base, parseado: { tipo: 'maquila', corte }, avisos: validarMaquila(corte) })
      } catch (e) {
        nuevos.push({ ...base, error: (e as Error).message })
      }
    }

    setArchivos((prev) => [...prev, ...nuevos])
    if (inputRef.current) inputRef.current.value = ''
  }

  async function guardarTodo() {
    setGuardando(true)
    const pendientes = archivos.filter((a) => a.parseado && !a.resultado?.ok)
    for (const a of pendientes) {
      try {
        const res = await fetch('/api/maquila/importar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archivo: a.b64, nombreArchivo: a.nombre }),
        })
        const json = await res.json()
        const mensaje =
          json.tipo === 'maquila'
            ? `Guardado ${json.clave}: ${json.resultados} productos, ${json.boletas} boletas ` +
              `(${json.boletasEnlazadas} enlazadas al acopio), ${json.lotes} lotes`
            : json.tipo === 'salidas'
              ? `Guardadas ${json.exportaciones} exportaciones y ${json.nacionales} salidas nacionales`
              : `Guardado inventario del ${json.fecha}: ${json.lineas} renglones`
        a.resultado = res.ok
          ? { ok: true, mensaje }
          : { ok: false, mensaje: json.error ?? `Error ${res.status}` }
      } catch (e) {
        a.resultado = { ok: false, mensaje: (e as Error).message }
      }
      setArchivos((prev) => [...prev])
    }
    setGuardando(false)
    router.refresh()
  }

  const validos = archivos.filter((a) => a.parseado)
  const porGuardar = validos.filter((a) => !a.resultado?.ok)
  const conErrores = validos.filter((a) => a.avisos.some((v) => v.nivel === 'error')).length

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
          Arrastra aquí los formatos del encargado (.xlsx) o haz clic para elegirlos
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Formatos de maquila, de repaso e inventarios de materia prima. Se revisan y se muestran
          antes de guardar; nada se inserta sin tu confirmación.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          multiple
          className="hidden"
          onChange={(e) => onArchivos(e.target.files)}
        />
      </label>

      {archivos.map((a, idx) => (
        <div key={`${a.nombre}-${idx}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">
                {a.parseado?.tipo === 'maquila'
                  ? `${a.parseado.corte.clave} · ${a.parseado.corte.fechaCorte ?? 'sin fecha'}`
                  : a.parseado?.tipo === 'inventario'
                    ? `Inventario · ${a.parseado.corte.fecha ?? 'sin fecha'}`
                    : a.parseado?.tipo === 'salidas'
                      ? `Programación de entregas · ${a.parseado.hoja.salidas.length} salidas`
                      : a.nombre}
              </p>
              <p className="truncate text-xs text-slate-500">{a.nombre}</p>
            </div>
            {a.resultado && (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  a.resultado.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {a.resultado.mensaje}
              </span>
            )}
          </div>

          {a.error && <p className="px-4 py-3 text-sm text-red-600">{a.error}</p>}

          {a.parseado?.tipo === 'maquila' && <ResumenMaquila corte={a.parseado.corte} />}
          {a.parseado?.tipo === 'inventario' && <ResumenInventario corte={a.parseado.corte} />}
          {a.parseado?.tipo === 'salidas' && <ResumenSalidas hoja={a.parseado.hoja} />}

          {a.avisos.length > 0 && (
            <ul className="space-y-1.5 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
              {a.avisos.map((v, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span
                    className={`mt-px shrink-0 rounded px-1.5 py-0.5 font-medium ${
                      v.nivel === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {v.nivel === 'error' ? 'No cuadra' : 'Revisar'}
                  </span>
                  <span className="text-slate-600">{v.mensaje}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {porGuardar.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-sm text-slate-600">
            {porGuardar.length} archivo{porGuardar.length === 1 ? '' : 's'} por guardar
            {conErrores > 0 && (
              <span className="text-amber-700">
                {' '}
                · {conErrores} con descuadres (se guardan con su alerta)
              </span>
            )}
          </p>
          <button
            onClick={guardarTodo}
            disabled={guardando}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar en el sistema'}
          </button>
        </div>
      )}
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{etiqueta}</dt>
      <dd className="text-sm font-medium tabular-nums text-slate-800">{valor}</dd>
    </div>
  )
}

function ResumenMaquila({ corte }: { corte: CorteMaquila }) {
  return (
    <div className="space-y-3 px-4 py-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta="Entra" valor={`${num(corte.kgEntrada)} kg · ${corte.sacosEntrada} s/c`} />
        <Dato etiqueta="Sale" valor={`${num(corte.kgSalida)} kg`} />
        <Dato etiqueta="Rendimiento" valor={pct(corte.rendimiento)} />
        <Dato etiqueta="Café" valor={`${corte.especie} ${corte.tipoEntrada}`} />
      </dl>

      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-500">
            <th className="py-1 font-medium">Producto</th>
            <th className="py-1 text-right font-medium">Sacos</th>
            <th className="py-1 text-right font-medium">Sueltos</th>
            <th className="py-1 text-right font-medium">Total kg</th>
          </tr>
        </thead>
        <tbody>
          {corte.resultados.map((r) => (
            <tr key={r.clave} className="border-b border-slate-50 last:border-0">
              <td className="py-1 text-slate-700">{r.etiqueta}</td>
              <td className="py-1 text-right tabular-nums text-slate-700">{r.sacos}</td>
              <td className="py-1 text-right tabular-nums text-slate-500">{num(r.kilosSueltos)}</td>
              <td className="py-1 text-right font-medium tabular-nums text-slate-800">{num(r.totalKg)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-slate-500">
        {corte.boletas.length} boleta{corte.boletas.length === 1 ? '' : 's'}
        {corte.lotes.length > 0 && ` · lotes ${corte.lotes.map((l) => l.numeroLote).join(', ')}`}
      </p>
    </div>
  )
}

function ResumenSalidas({ hoja }: { hoja: HojaSalidas }) {
  const exp = hoja.salidas.filter((s) => s.tipoSalida === 'exportacion')
  const nac = hoja.salidas.filter((s) => s.tipoSalida === 'nacional')
  const sacos = hoja.salidas.reduce((s, x) => s + x.sacos, 0)
  const qq = hoja.salidas.reduce((s, x) => s + (x.quintales ?? 0), 0)

  const canales: Record<string, number> = {}
  for (const s of nac) {
    const c = s.canal ?? '—'
    canales[c] = (canales[c] ?? 0) + 1
  }

  return (
    <div className="space-y-3 px-4 py-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Dato etiqueta="Exportaciones" valor={`${exp.length}`} />
        <Dato etiqueta="Salidas nacionales" valor={`${nac.length}`} />
        <Dato etiqueta="Sacos" valor={num(sacos, 2)} />
        <Dato etiqueta="Quintales" valor={num(qq, 2)} />
      </dl>
      <p className="text-xs text-slate-500">
        {Object.entries(canales).map(([c, n]) => `${c}: ${n}`).join(' · ')}
      </p>
    </div>
  )
}

function ResumenInventario({ corte }: { corte: CorteInventario }) {
  const conStock = corte.lineas.filter((l) => l.stockKg > 0)
  return (
    <div className="space-y-2 px-4 py-3">
      <p className="text-xs text-slate-500">
        {corte.lineas.length} renglones · {conStock.length} con existencia
      </p>
      <table className="w-full text-xs">
        <tbody>
          {conStock.map((l, i) => (
            <tr key={i} className="border-b border-slate-50 last:border-0">
              <td className="py-1 text-slate-500">{l.especie}</td>
              <td className="py-1 text-slate-700">{l.productoTexto}</td>
              <td className="py-1 text-right tabular-nums text-slate-700">{l.stockSacos} s/c</td>
              <td className="py-1 text-right font-medium tabular-nums text-slate-800">
                {num(l.stockKg)} kg
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
