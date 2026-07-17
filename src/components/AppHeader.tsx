'use client'

// Shared top bar: brand, organization name, module tabs and sign-out.
// Used by every module page so navigation is consistent.
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RolMembresia } from '@/lib/types'
import OfflineStatus from './OfflineStatus'

// soloAdmin: pestañas administrativas que NO ve el SIC (coordinador/inspector).
// El SIC solo ve su set operativo; el admin ve todo.
const TABS: { href: string; label: string; soloAdmin?: boolean }[] = [
  { href: '/panel', label: 'Panel' },
  { href: '/geosic', label: 'GeoSIC' },
  { href: '/satelite', label: 'Satélite' },
  { href: '/productores', label: 'Productores' },
  { href: '/certificacion', label: 'Certificación' },
  { href: '/lpa', label: 'LPA' },
  { href: '/certificados', label: 'Certificados' },
  { href: '/acopio', label: 'Acopio', soloAdmin: true },
  { href: '/ventas', label: 'Ventas', soloAdmin: true },
  { href: '/contratos', label: 'Contratos', soloAdmin: true },
  { href: '/crm', label: 'CRM', soloAdmin: true },
  { href: '/estimacion', label: 'Estimación' },
  { href: '/agroecologia', label: 'Agroecología', soloAdmin: true },
  { href: '/fichas', label: 'Fichas' },
  { href: '/bitacora', label: 'Bitácora' },
  { href: '/historial', label: 'Historial' },
]

export default function AppHeader({
  orgNombre,
  rol,
  children,
}: {
  orgNombre: string
  rol?: RolMembresia
  children?: React.ReactNode // slot for module-specific actions (e.g. upload button)
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  // El admin ve todas las pestañas; el resto (coordinador/inspector/solo_lectura)
  // solo el set del SIC (sin los módulos administrativos).
  const tabs = TABS.filter((t) => !t.soloAdmin || rol === 'admin')

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
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {/* La marca nunca se comprime ni se parte en dos líneas */}
          <div className="flex shrink-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/casfasa.png" alt="CASFASA" className="h-8 w-auto shrink-0" />
            <div className="leading-tight">
              <p className="whitespace-nowrap text-sm font-semibold text-slate-800">Kenzly CASFA</p>
              <p className="hidden max-w-[10rem] truncate text-xs text-slate-500 lg:block">{orgNombre}</p>
            </div>
          </div>

          {/* Navegación horizontal: con 13 módulos ya no cabe siempre — scroll
              horizontal en vez de encimarse sobre la marca */}
          <nav className="ml-2 hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex [scrollbar-width:thin]">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${
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

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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
          {tabs.map((t) => (
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
