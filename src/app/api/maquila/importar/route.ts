// POST /api/maquila/importar — importa UN formato de acopio (.xlsx).
//
// El navegador ya parseó y mostró el resumen, pero aquí se RE-PARSEA con el
// mismo motor (lib/maquila/importar.mjs → formato.mjs): no se confía en los
// números que manda el cliente, igual que en /api/ventas/facturas.
//
// La escritura vive en lib/maquila/importar.mjs, compartida con
// scripts/import-maquila.mjs (la carga inicial). Aquí sólo se resuelve la
// sesión, se calcula el hash y se traducen los errores a HTTP.
//
// Body: { archivo: string (base64), nombreArchivo: string }
import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { importarArchivo } from '@/lib/maquila/importar.mjs'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const b64 = typeof body?.archivo === 'string' ? body.archivo : ''
  const nombreArchivo =
    typeof body?.nombreArchivo === 'string' ? body.nombreArchivo : 'archivo.xlsx'
  if (!b64) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })

  const bytes = new Uint8Array(Buffer.from(b64, 'base64'))
  const hash = createHash('sha256').update(bytes).digest('hex')
  const supabase = await createClient()

  try {
    const resultado = await importarArchivo(supabase, session.orgId, bytes, nombreArchivo, hash)
    return NextResponse.json(resultado)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
