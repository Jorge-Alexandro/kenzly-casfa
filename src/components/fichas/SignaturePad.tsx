'use client'

// Minimal canvas signature pad. Emits a PNG data URL on change. For the MVP we
// store the data URL directly in the ficha's respuestas JSONB; a later pass can
// move signatures to Supabase Storage and keep only the URL.
import { useRef, useEffect, useState } from 'react'

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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0f172a'

    // Restore an existing signature (e.g. when editing).
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = value
    }
  }, [value])

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
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
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div>
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
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {hasInk ? 'Firma capturada' : 'Firma aquí con el dedo o mouse'}
        </span>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-slate-500 hover:text-red-600"
        >
          Limpiar
        </button>
      </div>
    </div>
  )
}
