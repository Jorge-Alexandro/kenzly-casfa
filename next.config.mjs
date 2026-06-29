import withSerwistInit from '@serwist/next'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // El doble montaje de StrictMode en desarrollo crea/destruye/recrea el mapa
  // de Mapbox y puede dejarlo sin pintar. Lo desactivamos para estabilizar el
  // ciclo de vida del mapa (no afecta producción).
  reactStrictMode: false,
}

// PWA: el service worker se genera desde src/app/sw.ts. Se DESACTIVA en
// desarrollo (el SW choca con HMR); para probar offline: `npm run build` + `npm start`.
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  disable: process.env.NODE_ENV === 'development',
})

export default withSerwist(nextConfig)
