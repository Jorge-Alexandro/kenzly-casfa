'use client'

// Captura de firma con dos modos:
//   - "Firmar": pad de canvas (dedo/mouse).
//   - "Huella / Foto": toma una foto (cámara) — solución para productores que
//     firman con huella o no pueden firmar en pantalla (#10 SIC).
// En ambos casos el valor guardado es un data URL (image/png|jpeg).
import { useRef, useEffect, useState } from 'react'

type Modo = 'firma' | 'foto'

export default function SignaturePad({
  value,
  onChange,
}: {
  value: string | null
  onChange: (dataUrl: string | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(!!value)
  const [modo, setModo] = useState<Modo>('firma')

  useEffect(() => {
    if (modo !== 'firma') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0f172a'
    if (value && value.startsWith('data:image')) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = value
    }
  }, [value, modo])

  function pos(e: React.PointerEvent) {
    // El canvas interno mide 400×120 pero el CSS lo estira a lo ancho de la
    // pantalla: hay que escalar el puntero o el trazo sale desplazado/agrandado.
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }
  function start(e: React.PointerEvent) {
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  function end() {
    if (!drawing.current) return
    drawing.current = false
    setHasInk(true)
    onChange(canvasRef.current!.toDataURL('image/png'))
  }
  function clear() {
    const canvas = canvasRef.current
    if (canvas) canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  // Foto (huella): redimensiona a máx 600px para no inflar el JSONB.
  function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 600
        const ratio = Math.min(max / img.width, max / img.height, 1)
        const c = document.createElement('canvas')
        c.width = img.width * ratio
        c.height = img.height * ratio
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        onChange(c.toDataURL('image/jpeg', 0.8))
        setHasInk(true)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <div className="mb-1 flex gap-1 text-xs">
        <button
          type="button"
          onClick={() => setModo('firma')}
          className={`rounded px-2 py-0.5 ${modo === 'firma' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          Firmar
        </button>
        <button
          type="button"
          onClick={() => setModo('foto')}
          className={`rounded px-2 py-0.5 ${modo === 'foto' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          Huella / Foto
        </button>
      </div>

      {modo === 'firma' ? (
        <canvas
          ref={canvasRef}
          width={400}
          height={120}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          className="w-full touch-none rounded-md border border-slate-300 bg-white"
        />
      ) : (
        <div className="rounded-md border border-slate-300 bg-white p-3">
          {value && value.startsWith('data:image') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Huella / foto" className="mb-2 max-h-32 rounded object-contain" />
          ) : null}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFoto}
            className="w-full text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-orange-50 file:px-2 file:py-1 file:text-xs file:font-medium file:text-orange-700"
          />
        </div>
      )}

      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {hasInk
            ? 'Captura lista'
            : modo === 'firma'
              ? 'Firma aquí con el dedo o mouse'
              : 'Toma una foto de la huella o firma en papel'}
        </span>
        <button type="button" onClick={clear} className="text-xs text-slate-500 hover:text-red-600">
          Limpiar
        </button>
      </div>
    </div>
  )
}
