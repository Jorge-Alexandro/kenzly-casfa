'use client'

// Shared top bar: brand, organization name, module tabs and sign-out.
// Used by every module page so navigation is consistent.
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
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
  const [menuOpen, setMenuOpen] = useState(false)

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const esActiva = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  return (
    <header className="relative border-b border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/casfasa.png" alt="CASFASA" className="h-8 w-auto shrink-0" />
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold text-slate-800">Kenzly CASFA</p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">{orgNombre}</p>
            </div>
          </div>

          {/* Navegación horizontal — solo en pantallas medianas o más grandes */}
          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  esActiva(t.href)
                    ? 'bg-orange-50 text-orange-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <OfflineStatus />
          </div>
          {children}
          <button
            onClick={signOut}
            className="hidden rounded-md px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 md:block"
          >
            Salir
          </button>
          {/* Botón de menú — solo en celular */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-md p-2 text-slate-600 transition hover:bg-slate-100 md:hidden"
            aria-label="Menú"
            aria-expanded={menuOpen}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {/* Menú desplegable en celular */}
      {menuOpen && (
        <nav className="border-t border-slate-100 bg-white px-2 pb-2 pt-1 md:hidden">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              onClick={() => setMenuOpen(false)}
              className={`block rounded-md px-3 py-2.5 text-sm font-medium transition ${
                esActiva(t.href)
                  ? 'bg-orange-50 text-orange-700'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </Link>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-slate-100 px-3 pt-2">
            <OfflineStatus />
            <button onClick={signOut} className="text-sm font-medium text-slate-600">
              Salir
            </button>
          </div>
        </nav>
      )}
    </header>
  )
}
