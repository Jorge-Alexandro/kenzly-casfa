// Guard de servidor para TODA ruta API del CRM: sesión válida + rol editor.
// Una sola implementación para no repetir reglas inconsistentes por ruta
// (la BD además refuerza con la política RLS es_editor_comercial).
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { puedeEditarCRM } from '@/lib/crm/permisos'
import type { UserSession } from '@/lib/types'

export type GuardCRM =
  | { ok: true; session: UserSession }
  | { ok: false; res: NextResponse }

export async function requireEditorCRM(): Promise<GuardCRM> {
  const session = await getSession()
  if (!session) {
    return { ok: false, res: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }
  if (!puedeEditarCRM(session.rol)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: 'Tu rol solo permite consultar el CRM, no modificarlo' },
        { status: 403 },
      ),
    }
  }
  return { ok: true, session }
}

// Normaliza un texto opcional del body: trim y '' → null.
export function textoOpcional(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s === '' ? null : s
}
