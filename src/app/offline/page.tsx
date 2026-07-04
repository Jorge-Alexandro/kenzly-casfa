// Página de respaldo sin conexión. El service worker la precachea y la sirve
// cuando una navegación no está en caché y no hay red (evita el error de Safari
// "no-response"). Debe ser ESTÁTICA para poder precachearse.
//
// Los enlaces usan <a> (navegación completa) a propósito: así el service worker
// puede servir la página destino desde el caché en vez de una petición RSC que
// fallaría sin conexión.
export const dynamic = 'force-static'

export const metadata = {
  title: 'Sin conexión — Kenzly CASFA',
}

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="CASFASA" className="mb-4 h-20 w-20" />

      <h1 className="text-lg font-semibold text-slate-800">Estás sin conexión</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        No hay internet en este momento. Puedes seguir <strong>levantando fichas</strong>:
        se guardan en el dispositivo y se suben solas cuando vuelva la señal.
      </p>

      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <a
          href="/fichas/nueva"
          className="rounded-md bg-orange-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-orange-600"
        >
          Levantar ficha
        </a>
        <a
          href="/fichas"
          className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Ver fichas
        </a>
      </div>

      <p className="mt-6 max-w-sm text-xs text-slate-400">
        Consejo: abre la app <strong>con internet</strong> al menos una vez al día para
        descargar los datos más recientes (productores, parcelas y formularios).
      </p>
    </div>
  )
}
