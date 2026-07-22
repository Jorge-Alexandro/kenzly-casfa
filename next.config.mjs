import withSerwistInit from '@serwist/next'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // El doble montaje de StrictMode en desarrollo crea/destruye/recrea el mapa
  // de Mapbox y puede dejarlo sin pintar. Lo desactivamos para estabilizar el
  // ciclo de vida del mapa (no afecta producción).
  reactStrictMode: false,

  // @react-pdf/renderer genera el PDF del recibo de acopio en el servidor.
  // Se deja fuera del bundle de Next (paquete externo) para que no rompa el
  // build ni infle los chunks.
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
  },
}

// Sello de esta compilación. `revision: null` significa "este archivo nunca
// cambia" y solo es cierto para assets con hash en el nombre. /offline es una
// PÁGINA: su HTML cambia en cada deploy y apunta a los chunks de ESE build. Con
// revision null el service worker se quedaba con la primera copia para siempre,
// y en campo salía una pantalla vieja, sin estilos y con botones que ya no
// existían. Con un sello por build, cada deploy la reemplaza.
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now())

// PWA: el service worker se genera desde src/app/sw.ts. Se DESACTIVA en
// desarrollo (el SW choca con HMR); para probar offline: `npm run build` + `npm start`.
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  // Precachea la página de respaldo offline para que el fallback del SW
  // siempre tenga algo que servir sin conexión, más los assets que la captura
  // en campo necesita ver sin señal (imagen de referencia del tipo de sombra,
  // logo del header).
  additionalPrecacheEntries: [
    { url: '/offline', revision: BUILD_ID },
    { url: '/referencias/tipo-sombra.jpg', revision: null },
    { url: '/logos/casfasa.png', revision: null },
  ],
  disable: process.env.NODE_ENV === 'development',
})

export default withSerwist(nextConfig)
