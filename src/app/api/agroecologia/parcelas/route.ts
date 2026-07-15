// GET /api/agroecologia/parcelas?productor_id=... — parcelas de un productor
// (para el selector dependiente del formulario de estimación). RLS por org.
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getParcelasDeProductor } from '@/lib/data/estimacion'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const productorId = new URL(request.url).searchParams.get('productor_id')
  if (!productorId) return NextResponse.json({ error: 'Falta productor_id' }, { status: 400 })

  const parcelas = await getParcelasDeProductor(productorId)
  return NextResponse.json({ parcelas })
}
