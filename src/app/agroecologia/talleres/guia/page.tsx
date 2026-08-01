// Agroecología — Guía: cómo quedó el flujo de reportes de taller en la app.
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessionResult } from '@/lib/session'
import AppHeader from '@/components/AppHeader'
import NoMembership from '@/components/geosic/NoMembership'

export const dynamic = 'force-dynamic'

function Fase({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-orange-600 text-xs font-semibold text-white">
        {n}
      </div>
      <div className="flex-1 pb-1">
        <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
        <div className="mt-1 space-y-2 text-sm text-slate-600">{children}</div>
      </div>
    </div>
  )
}

function Marcador({ children }: { children: string }) {
  return <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{children}</code>
}

export default async function GuiaTalleresPage() {
  const result = await getSessionResult()
  if (result.kind === 'no-auth') redirect('/login')
  if (result.kind === 'no-membership') return <NoMembership />

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50">
      <AppHeader orgNombre={result.session.orgNombre} rol={result.session.rol}>
        <Link href="/agroecologia/talleres" className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100">
          ← Talleres
        </Link>
      </AppHeader>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Guía: reportes de taller</h1>
            <p className="mt-1 text-sm text-slate-500">
              Antes, cada taller se reportaba escribiendo de cero un Word de ~10 páginas. Al comparar
              los reportes ya entregados, más del 90% del texto es siempre el mismo dentro de un mismo
              tipo de taller (introducción, objetivos, desarrollo…) — lo único que cambia evento a
              evento es la comunidad, la fecha, las horas, el técnico y quién asistió. La app separa
              esas dos cosas: el texto fijo vive una sola vez en la <strong>plantilla</strong> del tipo
              de taller, y cada reunión sólo captura esos pocos datos. El PDF final se arma solo.
            </p>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">El flujo, paso a paso</h2>
            <div className="space-y-5">
              <Fase n={1} titulo="Se imparte el taller">
                <p>En campo, como siempre: se toma la lista de firmas y, si hay, fotos de evidencia.</p>
              </Fase>
              <Fase n={2} titulo='Se captura en "+ Nuevo taller"'>
                <p>
                  Se elige el programa (Café / Cultivos Tropicales), el tipo de taller y la comunidad
                  (buscador con el catálogo; si la comunidad no está en la lista, se puede escribir a
                  mano). Se llena la fecha, hora de inicio/cierre, el técnico que lo dio y, si hace
                  falta, una nota del día. Nada del texto largo se vuelve a escribir — eso ya está en
                  la plantilla del tipo de taller elegido.
                </p>
              </Fase>
              <Fase n={3} titulo="Se enlaza la lista de asistencia (opcional)">
                <p>
                  Si la lista de firmas ya se capturó en <Link href="/asistencia" className="text-orange-700 hover:underline">Asistencia</Link>,
                  se enlaza desde el detalle del taller. Así el reporte trae la asistencia real (nombre
                  y sexo de cada participante) en vez de salir en blanco.
                </p>
              </Fase>
              <Fase n={4} titulo="Se suben las fotos">
                <p>
                  Desde el detalle del taller, "+ Agregar fotos". Se pueden subir varias a la vez;
                  quedan como el anexo fotográfico al final del PDF.
                </p>
              </Fase>
              <Fase n={5} titulo="Se descarga el reporte">
                <p>
                  El botón "Descargar reporte (PDF)" arma el documento completo al momento: portada,
                  ficha del evento, objetivos, desarrollo, lista de asistencia y anexo fotográfico —
                  con el mismo formato y logos que antes, pero sin volver a escribir nada.
                </p>
              </Fase>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Las plantillas</h2>
            <p className="text-sm text-slate-600">
              Hay una plantilla por combinación de programa + tipo de taller (por ejemplo, "Poda"
              dentro de Café). Ahí vive el texto fijo: introducción, objetivo general, objetivos
              específicos, ficha descriptiva, desarrollo, acuerdos y conclusiones. Sólo se edita
              cuando ese contenido cambia de verdad — no evento a evento. Se edita desde{' '}
              <Link href="/agroecologia/plantillas" className="text-orange-700 hover:underline">Plantillas</Link>.
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Dentro del texto de la plantilla se pueden usar estos marcadores; el PDF los reemplaza
              solo con el dato real de cada evento:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Marcador>{'{comunidad}'}</Marcador>
              <Marcador>{'{municipio}'}</Marcador>
              <Marcador>{'{fecha_larga}'}</Marcador>
              <Marcador>{'{tecnico}'}</Marcador>
              <Marcador>{'{hora_inicio}'}</Marcador>
              <Marcador>{'{hora_fin}'}</Marcador>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Los reportes ya entregados (histórico)</h2>
            <p className="text-sm text-slate-600">
              Los 117 reportes que ya se habían escrito a mano (Café y Cultivos Tropicales, ciclo
              2025-2026) ya están cargados como talleres marcados <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">histórico</span>.
              Sus plantillas se generaron automáticamente a partir del reporte más completo de cada
              tipo de taller. Las listas de asistencia de esos talleres se firmaron en papel y no
              están digitalizadas, así que su PDF sale sin la tabla de asistentes — el resto del
              reporte (introducción, desarrollo, acuerdos…) sí sale completo.
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Preguntas frecuentes</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-slate-700">Mi comunidad no aparece en la lista.</dt>
                <dd className="text-slate-600">Usa &quot;No está en la lista&quot; y escríbela a mano — el taller se guarda igual.</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">El taller no tiene plantilla todavía.</dt>
                <dd className="text-slate-600">
                  Sale un aviso en el detalle del taller. El PDF se puede descargar igual, pero sólo
                  con los datos del evento — hay que escribir la plantilla de ese tipo de taller en{' '}
                  <Link href="/agroecologia/plantillas" className="text-orange-700 hover:underline">Plantillas</Link> para
                  que salga completo.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">¿Puedo editar el PDF después de generarlo?</dt>
                <dd className="text-slate-600">
                  No directamente — se edita el dato de origen (los datos del evento o la plantilla) y
                  se vuelve a descargar; el PDF sale actualizado al momento.
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  )
}
