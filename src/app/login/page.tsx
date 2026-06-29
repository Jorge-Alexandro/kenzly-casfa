'use client'

// Email/password login backed by Supabase Auth. On success we push to the
// `next` param (or /geosic). Session cookies are set by the SSR client so the
// middleware/server components see the authenticated user immediately.
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  // useSearchParams must live under a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/panel'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    // Full navigation so the server re-reads the fresh session cookie.
    router.push(next)
    router.refresh()
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-100">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500 text-lg font-bold text-white">
            K
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              Kenzly GeoOps
            </h1>
            <p className="text-xs text-slate-500">Acceso a GeoSIC</p>
          </div>
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Correo
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mb-4 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">
          Contraseña
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mb-5 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-orange-400"
        />

        {error && (
          <p className="mb-4 rounded-md bg-red-50 p-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-orange-500 py-2 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
