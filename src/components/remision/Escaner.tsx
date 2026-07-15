'use client'

// Escáner de QR para el campo.
//
// Dos motores, en este orden:
//   1. BarcodeDetector — nativo del navegador (Chrome Android). Cero descarga,
//      lo hace el sistema, gasta menos batería.
//   2. jsQR — respaldo en JS puro para los navegadores sin BarcodeDetector
//      (Safari/iOS, sobre todo). Funciona 100% offline.
//
// Nada de esto llama a la red: el promotor está en la sierra sin señal, y ese
// es el requisito que manda sobre todo lo demás.
//
// Siempre hay captura MANUAL del código. La cámara falla —etiqueta raspada, sol
// de frente, lente sucio— y si la única vía fuera escanear, el promotor se
// quedaría parado con el camión esperando. El dígito verificador del código
// hace que teclearlo sea seguro (ver lib/remision/codigo.mjs).
import { useEffect, useRef, useState } from 'react'
import { validarCodigo } from '@/lib/remision/codigo.mjs'

interface Props {
  /** Se llama con el código YA validado y canónico. */
  onCodigo: (codigo: string) => void
  /** Códigos ya escaneados, para avisar del repetido sin ir al servidor. */
  yaEscaneados: string[]
}

type Motor = 'nativo' | 'jsqr' | 'ninguno'

export default function Escaner({ onCodigo, yaEscaneados }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [activa, setActiva] = useState(false)
  const [motor, setMotor] = useState<Motor>('ninguno')
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [ultimo, setUltimo] = useState<string | null>(null)

  // Se guarda en un ref para que el bucle de escaneo (que se crea una sola vez)
  // siempre lea la lista actual y no la que había al montar.
  const escaneadosRef = useRef(yaEscaneados)
  escaneadosRef.current = yaEscaneados

  function aceptar(texto: string): boolean {
    const codigo = validarCodigo(texto)
    if (!codigo) {
      setError(`"${texto}" no es un código de etiqueta válido.`)
      return false
    }
    if (escaneadosRef.current.includes(codigo)) {
      setError(`La etiqueta ${codigo} ya está en esta remisión.`)
      return false
    }
    setError(null)
    setUltimo(codigo)
    onCodigo(codigo)
    if (navigator.vibrate) navigator.vibrate(60)
    return true
  }

  useEffect(() => {
    if (!activa) return
    let stream: MediaStream | null = null
    let cancelado = false
    let rafId = 0

    async function arrancar() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
      } catch {
        setError('No se pudo abrir la cámara. Puedes teclear el código.')
        setActiva(false)
        return
      }
      const video = videoRef.current
      if (!video || cancelado) return
      video.srcObject = stream
      await video.play().catch(() => {})

      const Detector = (window as unknown as { BarcodeDetector?: new (o: object) => {
        detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]>
      } }).BarcodeDetector

      if (Detector) {
        setMotor('nativo')
        const det = new Detector({ formats: ['qr_code'] })
        const tick = async () => {
          if (cancelado || !videoRef.current) return
          try {
            const codigos = await det.detect(videoRef.current)
            if (codigos[0]?.rawValue) aceptar(codigos[0].rawValue)
          } catch {
            /* frame ilegible: se ignora y se sigue */
          }
          rafId = requestAnimationFrame(tick)
        }
        rafId = requestAnimationFrame(tick)
        return
      }

      // Respaldo: jsQR sobre un canvas. Se carga sólo si hace falta.
      setMotor('jsqr')
      const { default: jsQR } = await import('jsqr')
      const tick = () => {
        if (cancelado) return
        const v = videoRef.current
        const c = canvasRef.current
        if (v && c && v.readyState === v.HAVE_ENOUGH_DATA) {
          const ctx = c.getContext('2d', { willReadFrequently: true })
          if (ctx) {
            c.width = v.videoWidth
            c.height = v.videoHeight
            ctx.drawImage(v, 0, 0, c.width, c.height)
            const img = ctx.getImageData(0, 0, c.width, c.height)
            const r = jsQR(img.data, img.width, img.height)
            if (r?.data) aceptar(r.data)
          }
        }
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
    }

    arrancar()
    return () => {
      cancelado = true
      cancelAnimationFrame(rafId)
      stream?.getTracks().forEach((t) => t.stop())
    }
    // aceptar() lee la lista por ref, así que el bucle NO debe recrearse cuando
    // cambia yaEscaneados: eso reiniciaría la cámara en cada saco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activa])

  return (
    <div className="space-y-3">
      {activa ? (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} playsInline muted className="h-64 w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-40 rounded-lg border-4 border-white/70" />
          </div>
          <button
            onClick={() => setActiva(false)}
            className="absolute right-2 top-2 rounded-md bg-black/60 px-3 py-1.5 text-xs font-medium text-white"
          >
            Cerrar
          </button>
          <p className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white/80">
            {motor === 'nativo' ? 'lector del sistema' : 'lector jsQR'}
          </p>
        </div>
      ) : (
        <button
          onClick={() => {
            setError(null)
            setActiva(true)
          }}
          className="w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-orange-700"
        >
          Escanear etiqueta
        </button>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (aceptar(manual)) setManual('')
        }}
        className="flex gap-2"
      >
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="…o teclea el código: CAS-26-04871-4"
          inputMode="text"
          autoCapitalize="characters"
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!manual.trim()}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          Agregar
        </button>
      </form>

      {ultimo && !error && (
        <p className="text-xs text-emerald-700">Última: {ultimo}</p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}
    </div>
  )
}
