// GET /api/sentinel/historial?parcela_id=<uuid>&meses=6
// Serie de tiempo de índices de una parcela, para la gráfica del panel.
// Se pide bajo demanda al seleccionar la parcela: mandar el histórico de las
// 153 parcelas en el payload inicial de la página sería tirar ~150 KB al aire.
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getHistorialSatelite } from '@/lib/data/satelite'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const parcelaId = url.searchParams.get('parcela_id')
  const meses = Number(url.searchParams.get('meses') ?? 6)

  if (!parcelaId) {
    return NextResponse.json({ error: 'Falta parcela_id' }, { status: 400 })
  }

  try {
    const historial = await getHistorialSatelite(
      parcelaId,
      Number.isFinite(meses) && meses > 0 ? meses : 6,
    )
    return NextResponse.json({ ok: true, historial })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error desconocido' },
      { status: 400 },
    )
  }
}
