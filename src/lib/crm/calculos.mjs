// ============================================================================
// CRM — cálculos puros del pipeline (sin dependencias, testeables con node).
// Los consume el dashboard /crm y los verifica scripts/verify-crm.mjs.
// Igual que cfdi.mjs: JS plano + declaraciones en calculos.d.mts.
// ============================================================================

export const ETAPAS_ABIERTAS = ['nuevo', 'contactado', 'calificado', 'cotizacion', 'negociacion']

export function esAbierta(etapa) {
  return ETAPAS_ABIERTAS.includes(etapa)
}

// Valor ponderado = monto_estimado × probabilidad (probabilidad en % 0–100).
export function valorPonderado(monto, probabilidad) {
  const m = Number(monto)
  const p = Number(probabilidad)
  if (!Number.isFinite(m) || !Number.isFinite(p)) return 0
  return Math.round(m * (p / 100) * 100) / 100
}

// Agregado del pipeline para KPIs y columnas del Kanban.
// oportunidades: [{ etapa, monto_estimado, probabilidad }]
export function resumenPipeline(oportunidades) {
  const porEtapa = {}
  let totalAbierto = 0
  let ponderado = 0
  let abiertas = 0
  for (const o of oportunidades) {
    const fila = porEtapa[o.etapa] ?? { n: 0, monto: 0, ponderado: 0 }
    fila.n += 1
    fila.monto += Number(o.monto_estimado) || 0
    fila.ponderado += valorPonderado(o.monto_estimado, o.probabilidad)
    porEtapa[o.etapa] = fila
    if (esAbierta(o.etapa)) {
      abiertas += 1
      totalAbierto += Number(o.monto_estimado) || 0
      ponderado += valorPonderado(o.monto_estimado, o.probabilidad)
    }
  }
  return { abiertas, totalAbierto, ponderado: Math.round(ponderado * 100) / 100, porEtapa }
}

// Una actividad está vencida si sigue pendiente y su fecha programada ya pasó.
export function actividadVencida(actividad, ahora = new Date()) {
  if (actividad.completada_at) return false
  if (!actividad.fecha_programada) return false
  return new Date(actividad.fecha_programada).getTime() < ahora.getTime()
}

// Próxima (pendiente, programada dentro de los siguientes `dias`).
export function actividadProxima(actividad, ahora = new Date(), dias = 7) {
  if (actividad.completada_at || !actividad.fecha_programada) return false
  const t = new Date(actividad.fecha_programada).getTime()
  return t >= ahora.getTime() && t <= ahora.getTime() + dias * 86400000
}

// Oportunidad abierta cuya fecha estimada de cierre ya pasó (advertencia).
export function cierreVencido(oportunidad, hoy = new Date()) {
  if (!esAbierta(oportunidad.etapa) || !oportunidad.fecha_cierre_estimada) return false
  return oportunidad.fecha_cierre_estimada < hoy.toISOString().slice(0, 10)
}

// Oportunidad abierta que cierra dentro de los siguientes `dias`.
export function cierreProximo(oportunidad, hoy = new Date(), dias = 14) {
  if (!esAbierta(oportunidad.etapa) || !oportunidad.fecha_cierre_estimada) return false
  const hoyStr = hoy.toISOString().slice(0, 10)
  const limite = new Date(hoy.getTime() + dias * 86400000).toISOString().slice(0, 10)
  return oportunidad.fecha_cierre_estimada >= hoyStr && oportunidad.fecha_cierre_estimada <= limite
}

// Oportunidad abierta sin movimiento reciente: ni cambios (updated_at) ni
// actividad registrada en los últimos `dias`. ultimaActividad puede ser null.
export function sinSeguimiento(oportunidad, ultimaActividad, ahora = new Date(), dias = 14) {
  if (!esAbierta(oportunidad.etapa)) return false
  const limite = ahora.getTime() - dias * 86400000
  const ultimoMovimiento = Math.max(
    new Date(oportunidad.updated_at).getTime(),
    ultimaActividad ? new Date(ultimaActividad).getTime() : 0,
  )
  return ultimoMovimiento < limite
}
