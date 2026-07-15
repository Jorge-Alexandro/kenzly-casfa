// ============================================================================
// Validador de cuadres de un corte de maquila.
// ----------------------------------------------------------------------------
// El formato de Excel ya trae los números "calculados", pero nadie los verifica
// contra sí mismos: las fórmulas se rompen cuando insertan filas y el resultado
// sigue viéndose razonable. Esto revisa las identidades que DEBEN cumplirse y
// devuelve avisos; no corrige nada ni bloquea la importación.
//
// Regla de diseño: un corte con avisos SE IMPORTA, con sus avisos guardados en
// maquilas.avisos. Un dato que no cuadra sigue siendo el dato real que hay en
// bodega; esconderlo (o rechazarlo) es peor que registrarlo con la alerta.
//
// nivel 'error' = la aritmética del propio formato se contradice.
// nivel 'aviso' = es raro y hay que mirarlo, pero puede ser legítimo.
// ============================================================================
import { KG_POR_SACO } from './formato.mjs'

/** El saco de un LOTE de embarque pesa 70 kg, no 69. No son la misma unidad. */
export const KG_POR_SACO_LOTE = 70

const cerca = (a, b, tol) => Math.abs((a ?? 0) - (b ?? 0)) <= tol
const num = (n) => (n ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })
const kg = (n) => `${(n ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 1 })} kg`
const pct = (n) => `${((n ?? 0) * 100).toFixed(2)}%`

/**
 * @param {ReturnType<import('./formato.mjs').parsearMaquila>} m
 * @returns {{ nivel: 'error'|'aviso', codigo: string, mensaje: string }[]}
 */
export function validarMaquila(m) {
  const avisos = []
  const add = (nivel, codigo, mensaje) => avisos.push({ nivel, codigo, mensaje })

  // --- 1. Las boletas deben sumar lo que dice que entró al proceso ---------
  if (m.boletas.length > 0) {
    const sumaBoletas = m.boletas.reduce((s, b) => s + b.kgNetos, 0)
    if (!cerca(sumaBoletas, m.kgEntrada, 0.5)) {
      add('error', 'boletas_no_suman',
        `Las ${m.boletas.length} boletas suman ${kg(sumaBoletas)} pero el corte declara ` +
        `${kg(m.kgEntrada)} de entrada (difieren ${kg(Math.abs(sumaBoletas - m.kgEntrada))}).`)
    }
  } else if (m.tipoProceso !== 'repaso_clasificadora') {
    add('aviso', 'sin_boletas', 'El corte no trae boletas; no se puede rastrear de qué productores salió el café.')
  }

  // --- 2. El rendimiento que calculamos vs el que trae el Excel ------------
  if (m.rendimientoExcel != null && m.rendimiento != null) {
    if (!cerca(m.rendimiento, m.rendimientoExcel, 0.001)) {
      add('error', 'rendimiento_discrepa',
        `El rendimiento del Excel (${pct(m.rendimientoExcel)}) no coincide con el que sale de ` +
        `sus propios renglones (${pct(m.rendimiento)}). Revisa las fórmulas del formato.`)
    }
  }

  // --- 3. Rendimiento fuera de rango razonable ----------------------------
  if (m.rendimiento != null) {
    if (m.tipoProceso === 'maquila' && m.tipoEntrada === 'PERGAMINO') {
      if (m.rendimiento < 0.70 || m.rendimiento > 0.90) {
        add('aviso', 'rendimiento_atipico',
          `Rendimiento de ${pct(m.rendimiento)} en pergamino; lo normal está entre 70% y 90%.`)
      }
    } else if (m.rendimiento > 1.02) {
      add('aviso', 'rendimiento_atipico',
        `Sale más café del que entró (${pct(m.rendimiento)}). En un repaso puede pasar por ` +
        `humedad o por saco mal contado, pero conviene revisarlo.`)
    }
  }

  // --- 4. Cada renglón: sacos × kg/saco + sueltos = total ------------------
  for (const r of m.resultados) {
    if (r.totalKgExcel != null && !cerca(r.totalKg, r.totalKgExcel, 1)) {
      add('error', 'renglon_no_cuadra',
        `${r.etiqueta}: ${r.sacos} sacos × ${r.kgPorSaco} kg + ${r.kilosSueltos} kg sueltos = ` +
        `${kg(r.totalKg)}, pero el Excel dice ${kg(r.totalKgExcel)}.`)
    }
  }

  // --- 5. El cuadre de sacos de ORO EXPORTACIÓN ---------------------------
  // Identidad del pie del formato:
  //   producidos + arrastre − enviados − torrefacción − venta − otro lote
  //     = no enviados
  const oro = m.resultados.find((r) => r.clave === 'ORO_EXPORTACION')
  if (oro && m.tipoProceso !== 'repaso_clasificadora') {
    if (m.sacosCuadreTotal && oro.sacos !== m.sacosCuadreTotal) {
      add('error', 'total_sacos_discrepa',
        `El pie del formato dice "TOTAL DE SACOS ${m.sacosCuadreTotal}" pero el renglón de Oro ` +
        `Exportación produjo ${oro.sacos} sacos.`)
    }

    const esperadoNoEnviados =
      oro.sacos + m.sacosMaquilasPrevias
      - m.sacosEnviadosLotes - m.sacosTorrefaccion - m.sacosVenta - m.sacosOtroLote

    if (esperadoNoEnviados !== m.sacosNoEnviados) {
      const dif = esperadoNoEnviados - m.sacosNoEnviados
      add('error', 'cuadre_sacos',
        `No cuadran los sacos de Oro Exportación: ${oro.sacos} producidos + ` +
        `${m.sacosMaquilasPrevias} de cortes anteriores − ${m.sacosEnviadosLotes} enviados en lotes ` +
        `− ${m.sacosTorrefaccion} a torrefacción − ${m.sacosVenta} a venta − ${m.sacosOtroLote} a otro lote ` +
        `= ${esperadoNoEnviados}, pero el formato reporta ${m.sacosNoEnviados} no enviados ` +
        `(sobran ${Math.abs(dif)} sacos ${dif > 0 ? 'sin destino' : 'de más'}).`)
    }
  }

  // --- 6. Observación que menciona un arrastre no registrado --------------
  // "SE TOMARON LOS 56 SACOS QUE ESTABAN EN EL INVENTARIO" con el renglón de
  // cortes anteriores en 0: pasó de verdad en la maquila 19.
  if (m.observaciones) {
    const men = m.observaciones.match(/(\d+)\s+SACOS?\b[^.]*INVENTARIO/i)
    if (men && m.sacosMaquilasPrevias === 0) {
      add('aviso', 'arrastre_no_registrado',
        `La observación dice que se tomaron ${men[1]} sacos del inventario, pero el renglón ` +
        `"sacos de cortes de maquilas anteriores" está en 0.`)
    }
  }

  // --- 7. Lotes de embarque: 275 sacos de 70 kg ---------------------------
  for (const l of m.lotes) {
    const esperado = l.sacos * KG_POR_SACO_LOTE
    if (l.kg && !cerca(l.kg, esperado, 1)) {
      add('aviso', 'lote_no_cuadra',
        `Lote ${l.numeroLote}: ${l.sacos} sacos × ${KG_POR_SACO_LOTE} kg = ${kg(esperado)}, ` +
        `pero declara ${kg(l.kg)}.`)
    }
  }

  // --- 8. Sin fecha no hay dónde ponerlo en la línea de tiempo -------------
  if (!m.fechaCorte) {
    add('error', 'sin_fecha', 'No se encontró la fecha de corte en el formato.')
  }

  return avisos
}

/** ¿El corte tiene algún aviso de nivel error? */
export const tieneErrores = (avisos) => avisos.some((a) => a.nivel === 'error')

/**
 * Valida la hoja SALIDA contra su propia fila de TOTAL.
 *
 * No es un formalismo: el TOTAL del MASTER dice `=SUM(H13:H157)` pero los datos
 * arrancan en la fila 12, así que la suma se salta la primera exportación
 * completa (275 sacos / 418.41 QQ) desde el inicio de la cosecha. Este check es
 * lo que lo destapó.
 */
export function validarSalidas(res) {
  const avisos = []
  const add = (nivel, codigo, mensaje) => avisos.push({ nivel, codigo, mensaje })

  if (res.salidas.length === 0) {
    add('error', 'sin_salidas', 'La hoja SALIDA no tiene filas de datos.')
    return avisos
  }

  if (res.total) {
    const sacos = res.salidas.reduce((s, x) => s + x.sacos, 0)
    const qq = res.salidas.reduce((s, x) => s + (x.quintales ?? 0), 0)

    if (!cerca(sacos, res.total.sacos, 0.5)) {
      const dif = sacos - res.total.sacos
      add('error', 'total_salidas_no_cuadra',
        `Los ${res.salidas.length} renglones suman ${num(sacos)} sacos, pero la fila de TOTAL ` +
        `del Excel dice ${num(res.total.sacos)} (difieren ${num(Math.abs(dif))}). ` +
        `El rango de la fórmula SUM no abarca todas las filas.`)
    }
    if (!cerca(qq, res.total.quintales, 0.5)) {
      add('error', 'total_qq_no_cuadra',
        `Los renglones suman ${num(qq)} QQ, pero el TOTAL del Excel dice ` +
        `${num(res.total.quintales)}.`)
    }
  }

  // Una guía de exportación repetida es un embarque contado dos veces.
  const guias = new Map()
  for (const s of res.salidas) {
    if (!s.guia) continue
    guias.set(s.guia, (guias.get(s.guia) ?? 0) + 1)
  }
  for (const [guia, n] of guias) {
    if (n > 1) add('error', 'guia_repetida', `La guía ${guia} aparece ${n} veces.`)
  }

  return avisos
}

/**
 * Valida un corte de inventario: el stock debe ser entradas − salidas, y los
 * kilos deben ser consistentes con los sacos (sacos × 69 ≤ kg).
 */
export function validarInventario(inv) {
  const avisos = []
  const add = (nivel, codigo, mensaje) => avisos.push({ nivel, codigo, mensaje })

  if (!inv.fecha) add('error', 'sin_fecha', 'No se encontró la fecha del inventario.')

  for (const l of inv.lineas) {
    // Kardex en kilos: stock = entradas − salidas.
    const esperadoKg = l.entradasKg - l.salidasKg
    if (!cerca(esperadoKg, l.stockKg, 0.5)) {
      add('error', 'stock_no_cuadra',
        `${l.especie} / ${l.productoTexto}: entradas ${kg(l.entradasKg)} − salidas ` +
        `${kg(l.salidasKg)} = ${kg(esperadoKg)}, pero el stock dice ${kg(l.stockKg)}.`)
    }
    // Y en sacos. Es la MISMA identidad; se revisa aparte porque un descuadre
    // sólo en sacos (con los kilos bien) delata un saco mal contado en bodega.
    //
    // NO se valida sacos × 69 kg contra los kilos: los 69 kg/saco son del café
    // ORO. El pergamino ronda los 57 y el cacao los 58, así que esa cuenta
    // marcaba como error casi todo el inventario estando bien.
    const esperadoSacos = l.entradasSacos - l.salidasSacos
    if (esperadoSacos !== l.stockSacos) {
      add('error', 'stock_sacos_no_cuadra',
        `${l.especie} / ${l.productoTexto}: entradas ${l.entradasSacos} − salidas ` +
        `${l.salidasSacos} = ${esperadoSacos} sacos, pero el stock dice ${l.stockSacos}.`)
    }
  }
  return avisos
}
