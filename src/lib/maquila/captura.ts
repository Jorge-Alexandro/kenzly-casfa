// Captura NATIVA de un corte de maquila (Fase 1): reemplaza el Excel.
// Client-safe: el formulario lo usa para el rendimiento en vivo y los mismos
// avisos se recalculan en el servidor antes de guardar (no se confía en el
// cliente, igual que el resto de la app).
//
// A diferencia de validarMaquila (lib/maquila/validacion.mjs, pensado para un
// Excel ya lleno con fórmulas que pueden mentir), aquí casi no hay "el Excel
// dice vs lo que sale de sus renglones": los números SON el dato, porque el
// kg de entrada se computa de las boletas seleccionadas y el "no enviados" se
// computa de la identidad — no se capturan por separado para poder discrepar.
import { KG_POR_SACO_LOTE } from './validacion.mjs'

export const KG_POR_SACO = 69

/**
 * Una boleta ofrecida al capturista, con su SALDO (no siempre va completa a un
 * corte: una entrega comercial grande puede repartirse entre dos cortes en
 * días distintos — ya pasó con la boleta 302, 227 sacos partidos 127+100).
 */
export interface BoletaDisponible {
  id: string
  folio: number
  fecha_acopio: string
  especie: string
  tipo: string
  proveedor_nombre: string
  sacos_totales: number
  kg_totales: number
  sacos_disponibles: number
  kg_disponibles: number
}

/** Lo que el capturista decide usar de una boleta EN ESTE corte. */
export interface BoletaUso {
  entrada_id: string
  folio: number
  especie: string
  tipo: string
  proveedor_nombre: string
  sacos: number
  kg_brutos: number
  tara_kg: number
  kg_netos: number
}

export interface ResultadoInput {
  producto_id: string
  clave: string // para los checks de rendimiento (ORO_EXPORTACION…)
  etiqueta: string
  sacos: number
  kilos_sueltos: number
  kg_por_saco: number
}

export interface LoteInput {
  numero_lote: number
  sacos: number
  kg: number
  descripcion: string | null
}

export interface Cuadre {
  sacos_enviados_lotes: number
  sacos_maquilas_previas: number // arrastre, sugerido del corte anterior
  sacos_torrefaccion: number
  sacos_venta: number
  sacos_otro_lote: number
  sacos_repaso: number
}

export interface Aviso {
  nivel: 'error' | 'aviso'
  codigo: string
  mensaje: string
}

const kg = (n: number) => `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })} kg`
const pct = (n: number) => `${(n * 100).toFixed(2)}%`

/** kg totales de un renglón de resultado. */
export const totalKgResultado = (r: { sacos: number; kilos_sueltos: number; kg_por_saco: number }) =>
  Math.round((r.sacos * r.kg_por_saco + r.kilos_sueltos) * 100) / 100

/** Kg de entrada = suma de las boletas seleccionadas. Ya no se teclea aparte. */
export function sumaBoletas(boletas: BoletaUso[]) {
  return {
    sacos: boletas.reduce((s, b) => s + b.sacos, 0),
    kg: Math.round(boletas.reduce((s, b) => s + b.kg_netos, 0) * 100) / 100,
  }
}

/**
 * Identidad del pie del formato, pero CALCULADA en vez de capturada:
 *   no_enviados = producidos + arrastre − enviados_lotes − torrefacción − venta − otro_lote
 * Al no teclearse por separado, no puede discrepar de sí misma.
 */
export function calcularNoEnviados(oroSacos: number, c: Cuadre): number {
  return (
    oroSacos +
    c.sacos_maquilas_previas -
    c.sacos_enviados_lotes -
    c.sacos_torrefaccion -
    c.sacos_venta -
    c.sacos_otro_lote
  )
}

export interface CorteNativoInput {
  fechaCorte: string | null
  tipoProceso: 'maquila' | 'repaso_oro' | 'repaso_clasificadora'
  boletas: BoletaUso[]
  resultados: ResultadoInput[]
  lotes: LoteInput[]
  cuadre: Cuadre
}

/** Avisos vivos: mismo criterio que el importador, recortado a lo que puede
 * discrepar de verdad en una captura nativa (no hay "Excel dice" que comparar). */
export function validarCorteNativo(input: CorteNativoInput): Aviso[] {
  const avisos: Aviso[] = []
  const add = (nivel: Aviso['nivel'], codigo: string, mensaje: string) =>
    avisos.push({ nivel, codigo, mensaje })

  if (!input.fechaCorte) add('error', 'sin_fecha', 'Falta la fecha del corte.')

  if (input.boletas.length === 0 && input.tipoProceso !== 'repaso_clasificadora') {
    add('aviso', 'sin_boletas', 'No se seleccionó ninguna boleta; no se podrá rastrear de qué productores salió el café.')
  }

  // Todas las boletas del corte deben ser el mismo producto: el beneficio
  // procesa un tipo de materia prima a la vez.
  const combos = Array.from(new Set(input.boletas.map((b) => `${b.especie}|${b.tipo}`)))
  if (combos.length > 1) {
    add(
      'error',
      'boletas_mezcladas',
      `Las boletas seleccionadas no son del mismo café (${combos.join(', ')}). Un corte procesa un solo tipo a la vez.`,
    )
  }

  const kgEntrada = sumaBoletas(input.boletas).kg
  const kgSalida = input.resultados.reduce((s, r) => s + totalKgResultado(r), 0)
  const rendimiento = kgEntrada > 0 ? kgSalida / kgEntrada : null

  if (rendimiento != null) {
    const [especie, tipo] = combos[0]?.split('|') ?? []
    if (input.tipoProceso === 'maquila' && tipo === 'PERGAMINO') {
      if (rendimiento < 0.7 || rendimiento > 0.9) {
        add('aviso', 'rendimiento_atipico', `Rendimiento de ${pct(rendimiento)} en pergamino; lo normal está entre 70% y 90%.`)
      }
    } else if (rendimiento > 1.02) {
      add('aviso', 'rendimiento_atipico', `Sale más café del que entró (${pct(rendimiento)}). Puede pasar por humedad, pero conviene revisarlo.`)
    }
    void especie
  }

  for (const l of input.lotes) {
    const esperado = l.sacos * KG_POR_SACO_LOTE
    if (l.kg && Math.abs(l.kg - esperado) > 1) {
      add('aviso', 'lote_no_cuadra', `Lote ${l.numero_lote}: ${l.sacos} sacos × ${KG_POR_SACO_LOTE} kg = ${kg(esperado)}, pero declara ${kg(l.kg)}.`)
    }
  }

  return avisos
}

/**
 * ¿Lo que se quiere usar de cada boleta cabe en su saldo? Se corre SIEMPRE en
 * el servidor justo antes de guardar (nunca se confía en el saldo que el
 * cliente traía cargado, puede haber cambiado si alguien más capturó un corte
 * mientras tanto). `disponible` sale de una consulta fresca en ese momento.
 */
export function validarSaldoBoletas(
  usos: BoletaUso[],
  disponible: Map<string, { sacos_disponibles: number; kg_disponibles: number }>,
): Aviso[] {
  const avisos: Aviso[] = []
  for (const u of usos) {
    if (u.sacos <= 0 && u.kg_netos <= 0) {
      avisos.push({ nivel: 'error', codigo: 'uso_vacio', mensaje: `Boleta ${u.folio}: no se indicó cuánto se usa (0 sacos, 0 kg).` })
      continue
    }
    const d = disponible.get(u.entrada_id)
    if (!d) {
      avisos.push({ nivel: 'error', codigo: 'boleta_no_disponible', mensaje: `Boleta ${u.folio}: ya no existe o ya no tiene saldo disponible.` })
      continue
    }
    if (u.sacos > d.sacos_disponibles + 0.01) {
      avisos.push({
        nivel: 'error', codigo: 'excede_sacos',
        mensaje: `Boleta ${u.folio}: se quieren usar ${u.sacos} sacos pero sólo hay ${d.sacos_disponibles} disponibles.`,
      })
    }
    if (u.kg_netos > d.kg_disponibles + 0.5) {
      avisos.push({
        nivel: 'error', codigo: 'excede_kg',
        mensaje: `Boleta ${u.folio}: se quieren usar ${kg(u.kg_netos)} pero sólo hay ${kg(d.kg_disponibles)} disponibles.`,
      })
    }
  }
  return avisos
}
