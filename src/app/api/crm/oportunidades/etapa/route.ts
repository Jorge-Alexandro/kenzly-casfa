// POST /api/crm/oportunidades/etapa — mueve una oportunidad de etapa.
// Reglas de negocio (servidor, no UI):
//   - 'perdido' exige motivo_perdida (el CHECK de la BD lo refuerza).
//   - 'ganado' NO crea ninguna venta ni factura (Ventas es la fuente de
//     verdad); opcionalmente vincula la cuenta con un ventas_cliente
//     existente o crea uno nuevo con RFC único por org.
//   - La probabilidad se ajusta a la sugerida de la etapa salvo que venga
//     explícita en el body.
// El historial de etapas lo escribe el trigger de la BD, no esta ruta.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireEditorCRM, textoOpcional } from '@/lib/crm/guard'
import { ETAPAS, PROBABILIDAD_SUGERIDA, type EtapaOportunidad } from '@/lib/crm/tipos'

export async function POST(request: Request) {
  const guard = await requireEditorCRM()
  if (!guard.ok) return guard.res

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const id = String(body.oportunidad_id ?? '')
  const etapa = String(body.etapa ?? '') as EtapaOportunidad
  if (!id) return NextResponse.json({ error: 'Falta id de la oportunidad' }, { status: 400 })
  if (!ETAPAS.includes(etapa)) return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 })

  const supabase = await createClient()
  const { data: opp } = await supabase
    .from('crm_oportunidad')
    .select('id, etapa, cuenta_id')
    .eq('id', id)
    .maybeSingle()
  if (!opp) return NextResponse.json({ error: 'Oportunidad no encontrada' }, { status: 404 })
  if (opp.etapa === etapa) return NextResponse.json({ ok: true, etapa }) // sin cambio

  const motivo = textoOpcional(body.motivo_perdida)
  if (etapa === 'perdido' && !motivo) {
    return NextResponse.json(
      { error: 'Indica el motivo de la pérdida (obligatorio al marcar perdida)' },
      { status: 400 },
    )
  }

  // Al ganar, opcionalmente conectar la cuenta con el cliente fiscal.
  let ventasClienteId: string | null = null
  if (etapa === 'ganado' && body.ventas_cliente && typeof body.ventas_cliente === 'object') {
    const vc = body.ventas_cliente as Record<string, unknown>
    const { data: cuenta } = await supabase
      .from('crm_cuenta')
      .select('id, nombre, ventas_cliente_id')
      .eq('id', opp.cuenta_id)
      .maybeSingle()
    if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 400 })

    if (!cuenta.ventas_cliente_id) {
      const clienteExistente = textoOpcional(vc.cliente_id)
      if (clienteExistente) {
        const { data: cli } = await supabase
          .from('ventas_cliente')
          .select('id')
          .eq('id', clienteExistente)
          .maybeSingle()
        if (!cli) return NextResponse.json({ error: 'Cliente fiscal no encontrado' }, { status: 400 })
        ventasClienteId = cli.id
      } else {
        const rfc = String(vc.rfc ?? '').trim().toUpperCase()
        const nombreFiscal = String(vc.nombre ?? cuenta.nombre ?? '').trim()
        if (!rfc || rfc.length < 12 || rfc.length > 13) {
          return NextResponse.json({ error: 'RFC inválido (12–13 caracteres)' }, { status: 400 })
        }
        const { data: repetido } = await supabase
          .from('ventas_cliente')
          .select('id, nombre')
          .eq('rfc', rfc)
          .maybeSingle()
        if (repetido) {
          return NextResponse.json(
            { error: `Ese RFC ya existe (${repetido.nombre}). Elige "vincular existente".` },
            { status: 409 },
          )
        }
        const { data: nuevo, error: cErr } = await supabase
          .from('ventas_cliente')
          .insert({
            org_id: guard.session.orgId,
            rfc,
            nombre: nombreFiscal,
            regimen_fiscal: textoOpcional(vc.regimen_fiscal),
          })
          .select('id')
          .single()
        if (cErr) return NextResponse.json({ error: cErr.message }, { status: 400 })
        ventasClienteId = nuevo.id
      }

      const { error: vErr } = await supabase
        .from('crm_cuenta')
        .update({ ventas_cliente_id: ventasClienteId, tipo: 'cliente' })
        .eq('id', opp.cuenta_id)
      if (vErr) {
        const msg = vErr.message.includes('crm_cuenta_ventas_cliente_uk')
          ? 'Ese cliente fiscal ya está vinculado a otra cuenta CRM'
          : vErr.message
        return NextResponse.json({ error: msg }, { status: 400 })
      }
    } else {
      // Ya estaba vinculada: solo promover el tipo si hiciera falta.
      ventasClienteId = cuenta.ventas_cliente_id
      await supabase.from('crm_cuenta').update({ tipo: 'cliente' }).eq('id', opp.cuenta_id)
    }
  }

  const probabilidad = Number.isFinite(Number(body.probabilidad))
    ? Math.min(100, Math.max(0, Math.round(Number(body.probabilidad))))
    : PROBABILIDAD_SUGERIDA[etapa]

  // El trigger sella ganado_at/perdido_at y registra el historial.
  const { error } = await supabase
    .from('crm_oportunidad')
    .update({ etapa, probabilidad, motivo_perdida: etapa === 'perdido' ? motivo : null })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, etapa, ventas_cliente_id: ventasClienteId })
}
