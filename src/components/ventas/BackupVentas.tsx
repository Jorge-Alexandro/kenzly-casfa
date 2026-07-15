'use client'

// Backup cifrado del módulo Ventas (AES-256-GCM, Web Crypto). La contraseña
// la define el usuario en este modal y NUNCA viaja al servidor: los datos
// llegan planos por la sesión autenticada y se cifran aquí. El mismo modal
// importa un .json.enc anterior, lo descifra y deja descargar el JSON plano.
import { useState } from 'react'
import { cifrarBackup, descifrarBackup } from '@/lib/ventas/backup'

type Modo = 'exportar' | 'importar'

function descargar(nombre: string, contenido: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

export default function BackupVentas() {
  const [abierto, setAbierto] = useState(false)
  const [modo, setModo] = useState<Modo>('exportar')
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)
  const [restaurado, setRestaurado] = useState<Record<string, unknown> | null>(null)

  function cerrar() {
    setAbierto(false)
    setPassword('')
    setConfirmacion('')
    setArchivo(null)
    setMensaje(null)
    setRestaurado(null)
  }

  async function exportar() {
    setMensaje(null)
    if (password.length < 8) {
      setMensaje({ ok: false, texto: 'La contraseña debe tener al menos 8 caracteres.' })
      return
    }
    if (password !== confirmacion) {
      setMensaje({ ok: false, texto: 'Las contraseñas no coinciden.' })
      return
    }
    setTrabajando(true)
    try {
      const res = await fetch('/api/ventas/backup')
      const datos = await res.json()
      if (!res.ok) throw new Error(datos.error ?? `Error ${res.status}`)
      const cifrado = await cifrarBackup(datos, password)
      const fecha = new Date().toISOString().slice(0, 10)
      descargar(`CASFASA_Backup_${fecha}.json.enc`, cifrado, 'application/octet-stream')
      setMensaje({ ok: true, texto: 'Backup cifrado descargado. Guarda la contraseña en un lugar seguro.' })
    } catch (e) {
      setMensaje({ ok: false, texto: (e as Error).message })
    }
    setTrabajando(false)
  }

  async function importar() {
    setMensaje(null)
    setRestaurado(null)
    if (!archivo) {
      setMensaje({ ok: false, texto: 'Elige el archivo .json.enc del backup.' })
      return
    }
    setTrabajando(true)
    try {
      const texto = await archivo.text()
      const datos = (await descifrarBackup(texto, password)) as Record<string, unknown>
      setRestaurado(datos)
      setMensaje({ ok: true, texto: 'Backup descifrado correctamente.' })
    } catch (e) {
      setMensaje({ ok: false, texto: (e as Error).message })
    }
    setTrabajando(false)
  }

  const resumenRestaurado = restaurado
    ? Object.entries(restaurado)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => `${k}: ${(v as unknown[]).length}`)
        .join(' · ')
    : ''

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
      >
        Backup
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={cerrar}>
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-800">Backup del módulo Ventas</h2>
              <button onClick={cerrar} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
                ✕
              </button>
            </div>

            <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
              {(['exportar', 'importar'] as Modo[]).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setModo(m)
                    setMensaje(null)
                    setRestaurado(null)
                  }}
                  className={`flex-1 rounded-md px-3 py-1.5 capitalize transition ${
                    modo === m ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {modo === 'exportar' ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Descarga clientes, facturas, ventas, inventario y precios en un archivo cifrado
                  (AES-256-GCM) con la contraseña que definas.
                </p>
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  Si pierdes esta contraseña, no podrás recuperar el backup.
                </p>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña (mínimo 8 caracteres)"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                />
                <input
                  type="password"
                  value={confirmacion}
                  onChange={(e) => setConfirmacion(e.target.value)}
                  placeholder="Confirma la contraseña"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={exportar}
                  disabled={trabajando}
                  className="w-full rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-50"
                >
                  {trabajando ? 'Cifrando…' : 'Descargar backup cifrado'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Elige un backup .json.enc anterior y su contraseña para descifrarlo.
                </p>
                <input
                  type="file"
                  accept=".enc,.json.enc,application/octet-stream"
                  onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña del backup"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                />
                <button
                  onClick={importar}
                  disabled={trabajando}
                  className="w-full rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-50"
                >
                  {trabajando ? 'Descifrando…' : 'Descifrar backup'}
                </button>
                {restaurado && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    <p className="font-medium">Contenido: {resumenRestaurado}</p>
                    <button
                      onClick={() =>
                        descargar(
                          `CASFASA_Backup_descifrado_${new Date().toISOString().slice(0, 10)}.json`,
                          JSON.stringify(restaurado, null, 2),
                          'application/json',
                        )
                      }
                      className="mt-1.5 text-sm font-medium text-emerald-700 underline"
                    >
                      Descargar JSON descifrado
                    </button>
                  </div>
                )}
              </div>
            )}

            {mensaje && (
              <p
                className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                  mensaje.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-800'
                }`}
              >
                {mensaje.texto}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
