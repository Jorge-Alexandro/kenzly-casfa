// Auth middleware: refreshes the Supabase session on every request and
// redirects unauthenticated users to /login (except for static assets).
import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh session — never use getSession() here (can be spoofed),
  // getUser() makes a real network call to Supabase Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/login')
  const isApiRoute = pathname.startsWith('/api/')
  // /offline es la página de respaldo del service worker: debe ser pública
  // para que se precachee correctamente (sin redirigir a /login).
  const isPublicRoute = pathname === '/offline'

  if (!user && !isAuthRoute && !isApiRoute && !isPublicRoute) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/panel', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Corre en todas las rutas MENOS internals de Next, archivos estáticos y
    // los scripts del service worker.
    //
    // sw.js / swe-worker-*.js DEBEN quedar fuera: si el middleware los redirige
    // a /login (usuario sin sesión), la descarga del script del service worker
    // termina en redirect y, por especificación, la actualización del SW FALLA.
    // El SW viejo entonces se queda vivo para siempre sirviendo bundles
    // cacheados (hidratación rota, "Failed to fetch" en el login) y ni
    // desregistrarlo lo arregla.
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|swe-worker-.*\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
