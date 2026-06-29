import type { MetadataRoute } from 'next'

// Web App Manifest → /manifest.webmanifest. Hace la app instalable como PWA
// en el celular de los inspectores para captura de fichas en campo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kenzly CASFA',
    short_name: 'Kenzly CASFA',
    description:
      'Inspección, certificación y trazabilidad geográfica de parcelas — CASFA / Red Maya de Organizaciones Orgánicas.',
    start_url: '/panel',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#F8921D',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
