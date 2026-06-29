// GET /api/sync/catalogos — entrega plantillas + productores + parcelas para
// cachear en el cliente (IndexedDB) y permitir captura offline en campo.
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import {
  getFormTemplates,
  getProductoresLite,
  getParcelasLite,
} from '@/lib/data/fichas'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const [templates, productores, parcelas] = await Promise.all([
    getFormTemplates(),
    getProductoresLite(),
    getParcelasLite(),
  ])

  return NextResponse.json({ templates, productores, parcelas })
}
