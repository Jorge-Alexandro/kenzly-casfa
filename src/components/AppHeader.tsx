'use client'

// Shared top bar: brand, organization name, module tabs and sign-out.
// Used by every module page so navigation is consistent.
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import OfflineStatus from './OfflineStatus'

const TABS = [
  { href: '/panel', label: 'Panel' },
  { href: '/geosic', label: 'GeoSIC' },
  { href: '/productores', label: 'Productores' },
  { href: '/fichas', label: 'Fichas' },
  { href: '/bitacora', label: 'Bitácora' },
  { href: '/historial', label: 'Historial' },
]

export default function AppHeader({
  orgNombre,
  children,
}: {
  orgNombre: string
  children?: React.ReactNode // slot for module-specific actions (e.g. upload button)
}) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/casfasa.png" alt="CASFASA" className="h-8 w-auto" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-800">Kenzly CASFA</p>
            <p className="text-xs text-slate-500">{orgNombre}</p>
          </div>
        </div>

        <nav className="ml-2 flex items-center gap-1">
          {TABS.map((t) => {
            // Highlight on the section root and any of its sub-routes.
            const active = pathname === t.href || pathname.startsWith(t.href + '/')
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-orange-50 text-orange-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <OfflineStatus />
        {children}
        <button
          onClick={signOut}
          className="rounded-md px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
        >
          Salir
        </button>
      </div>
    </header>
  )
}
