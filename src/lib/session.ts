// Resolves the authenticated user together with their active organization
// and role. Every data query downstream is scoped by this org_id — we never
// trust an org_id coming from the client.
import { createClient } from '@/lib/supabase/server'
import type { UserSession, RolMembresia } from '@/lib/types'

export type SessionResult =
  | { kind: 'ok'; session: UserSession }
  | { kind: 'no-auth' } // no hay usuario autenticado
  | { kind: 'no-membership' } // usuario válido pero sin organización

export async function getSessionResult(): Promise<SessionResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { kind: 'no-auth' }

  // Resolve the membership (org + role). For now we take the first membership;
  // a future org-switcher would pass a desired org and validate membership here.
  const { data: membresia, error } = await supabase
    .from('membresias')
    .select('rol, org_id, organizaciones ( id, nombre, slug )')
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[session] error consultando membresia:', error.message)
    return { kind: 'no-membership' }
  }
  if (!membresia) {
    console.error(
      `[session] usuario ${user.email} (${user.id}) autenticado pero sin filas en membresias (¿RLS o falta el row?).`,
    )
    return { kind: 'no-membership' }
  }

  const org = Array.isArray(membresia.organizaciones)
    ? membresia.organizaciones[0]
    : membresia.organizaciones

  if (!org) {
    console.error('[session] membresia sin organizacion embebida.')
    return { kind: 'no-membership' }
  }

  return {
    kind: 'ok',
    session: {
      userId: user.id,
      email: user.email ?? '',
      nombre: (user.user_metadata?.nombre as string) ?? null,
      orgId: org.id,
      orgNombre: org.nombre,
      orgSlug: org.slug,
      rol: membresia.rol as RolMembresia,
    },
  }
}

// Backwards-compatible helper that returns the session or null.
export async function getSession(): Promise<UserSession | null> {
  const r = await getSessionResult()
  return r.kind === 'ok' ? r.session : null
}
