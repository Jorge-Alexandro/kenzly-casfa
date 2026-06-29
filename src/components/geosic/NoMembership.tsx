'use client'

// Shown when the user is authenticated but has no membership row (so RLS would
// hide all data). Breaks the /login <-> /geosic redirect loop and lets them
// sign out to try another account.
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NoMembership() {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-100 p-6">
      <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
          ⚠️
        </div>
        <h1 className="mb-2 text-lg font-semibold text-slate-800">
          Tu cuenta no tiene organización asignada
        </h1>
        <p className="mb-6 text-sm text-slate-600">
          Iniciaste sesión correctamente, pero no encontramos una membresía en
          ninguna organización. Ejecuta el bloque de bootstrap del SQL{' '}
          <code className="rounded bg-slate-100 px-1">
            0002_storage_and_bootstrap.sql
          </code>{' '}
          o pide a un administrador que te agregue.
        </p>
        <button
          onClick={signOut}
          className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
