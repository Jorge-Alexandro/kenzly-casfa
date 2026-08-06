// GET /api/lpa?grupo=robusta|general|tropicales&ciclo=2025-2026 — genera y
// descarga el LPA de ese grupo (Excel). CASFA manda 3 LPA separados a
// MAYACERT (Café Robusta, Café General, Cultivos Tropicales) — no uno solo.
import { getSession } from '@/lib/session'
import { buildLpaGrupo, GRUPOS_LPA, type GrupoLpa } from '@/lib/data/lpa'
import { buildXlsx } from '@/lib/xlsx.mjs'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) return new Response('No autenticado', { status: 401 })

  const url = new URL(request.url)
  const grupoParam = url.searchParams.get('grupo')
  const grupo = GRUPOS_LPA.find((g) => g.id === grupoParam)?.id as GrupoLpa | undefined
  if (!grupo) return new Response('Falta ?grupo= (robusta | general | tropicales)', { status: 400 })

  const ciclo = url.searchParams.get('ciclo')
  const { sheets, resumen } = await buildLpaGrupo(grupo, ciclo)
  const bytes = buildXlsx(sheets)

  const etiqueta = (resumen.ciclo ?? new Date().toISOString().slice(0, 10)).replace(/[^\w-]/g, '_')
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="LPA_${grupo}_${etiqueta}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
