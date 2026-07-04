// Página de respaldo sin conexión. El service worker la precachea y la sirve
// cuando una navegación no está en caché y no hay red (evita el error de Safari
// "no-response"). Debe ser ESTÁTICA para poder precacharse.
//
// El contenido (mensaje + captura de fichas offline) va en OfflineClient, un
// componente de cliente: así la captura funciona sin servidor. Esta página
// (server component) solo declara la ruta como estática.
import OfflineClient from '@/components/OfflineClient'

export const dynamic = 'force-static'

export const metadata = {
  title: 'Sin conexión — Kenzly CASFA',
}

export default function OfflinePage() {
  return <OfflineClient />
}
