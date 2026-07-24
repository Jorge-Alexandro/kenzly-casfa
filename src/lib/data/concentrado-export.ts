// Exportación del concentrado de acopio a Excel, con las mismas tres hojas del
// reporte que Francisco arma a mano: el concentrado de boletas, el pivote de QQ
// acopiados por mes y tipo de café, y el reparto por cooperativa en QQ y lotes.
import {
  getConcentrado, armarQQAcopiados, armarCooperativas, type FiltrosConcentrado,
} from '@/lib/data/concentrado'
import { LOTE_QQ } from '@/lib/acopio/concentrado'
import type { Sheet, CellValue } from '@/lib/xlsx.mjs'

const r2 = (n: number) => Math.round(n * 100) / 100
const nz = (n: number) => (n ? r2(n) : null) // celda vacía en vez de 0, como su Excel

export async function buildConcentradoExport(f: FiltrosConcentrado): Promise<{
  sheets: Sheet[]
  resumen: { boletas: number; qq: number; lotes: number }
}> {
  const boletas = await getConcentrado(f)
  const qqAcopiados = armarQQAcopiados(boletas)
  const coops = armarCooperativas(boletas)

  const periodo = f.desde || f.hasta ? `${f.desde ?? '—'} a ${f.hasta ?? '—'}` : 'Todo el acopio'

  // ── Hoja 1: Concentrado (el detalle, como su MATRIX) ─────────────────────
  const concentrado: CellValue[][] = [
    ['CONCENTRADO DE ACOPIO'],
    ['Periodo', periodo],
    ['Generado', new Date().toISOString().slice(0, 16).replace('T', ' ')],
    [],
    [
      '#', 'FECHA', 'MES', 'FOLIO', 'COMUNIDAD', 'MUNICIPIO', 'PROVEEDOR',
      'TIPO PROVEEDOR', 'TIPO DE CAFÉ', 'SACOS', 'KILOS BRUTOS', 'TARA',
      'KILOS NETOS', 'QQ', 'PRECIO KILO', 'IMPORTE', 'FACTURAS', 'IMPORTE PAGADO',
    ],
    ...boletas.map((b, i) => [
      i + 1, b.fecha, b.mes, b.folio, b.comunidad, b.municipio, b.proveedor,
      b.tipo_persona === 'moral' ? 'PERSONA MORAL' : 'PERSONA FISICA',
      b.tipo_cafe, b.sacos, r2(b.kg_brutos), r2(b.tara_kg), r2(b.kg_netos),
      b.quintales, b.precio_kg, b.importe, b.facturas, nz(b.importe_pagado),
    ]),
  ]

  // ── Hoja 2: QQ acopiados (pivote mes × tipo de café) ─────────────────────
  const t = qqAcopiados.tipos
  const qq: CellValue[][] = [
    ['QQ ACOPIADOS'],
    ['Periodo', periodo],
    [],
    // Dos filas de encabezado: el tipo de café abarca sus tres columnas.
    ['', ...t.flatMap((x) => [x, '', '']), 'TOTAL', '', ''],
    ['MES', ...t.flatMap(() => ['KILOS NETOS', 'QQ', 'IMPORTE']), 'KILOS NETOS', 'QQ', 'IMPORTE'],
    ...qqAcopiados.filas.map((fila) => [
      fila.mes,
      ...t.flatMap((x) => {
        const c = fila.porTipo[x]
        return c ? [nz(c.kg), nz(c.qq), nz(c.importe)] : [null, null, null]
      }),
      r2(fila.total.kg), r2(fila.total.qq), r2(fila.total.importe),
    ]),
    [
      'TOTAL GENERAL',
      ...t.flatMap((x) => {
        const c = qqAcopiados.totalPorTipo[x]
        return c ? [r2(c.kg), r2(c.qq), r2(c.importe)] : [null, null, null]
      }),
      r2(qqAcopiados.total.kg), r2(qqAcopiados.total.qq), r2(qqAcopiados.total.importe),
    ],
    [],
    ['EQUIVALENTE EN LOTES', `${LOTE_QQ} qq por lote`, r2(qqAcopiados.total.qq / LOTE_QQ)],
    [],
    ['CACAO (aparte: no lleva quintal, se reporta en kilos)'],
    ['Boletas', qqAcopiados.cacao.boletas],
    ['Kilos netos', r2(qqAcopiados.cacao.kg)],
    ['Importe', r2(qqAcopiados.cacao.importe)],
  ]

  // ── Hoja 3: Cooperativas ─────────────────────────────────────────────────
  const cooperativas: CellValue[][] = [
    ['ACOPIO POR COOPERATIVA'],
    ['Periodo', periodo],
    ['Lote', `${LOTE_QQ} qq`],
    [],
    ['#', 'SOCIEDAD', 'BOLETAS', 'KILOS NETOS', 'QQ', 'LOTES', 'IMPORTE'],
    ...coops.sociedades.map((s, i) => [
      i + 1, s.nombre, s.boletas, r2(s.kg), r2(s.qq), r2(s.lotes), nz(s.importe),
    ]),
    [
      '', 'TOTAL COOPERATIVAS',
      coops.sociedades.reduce((a, s) => a + s.boletas, 0),
      r2(coops.sociedades.reduce((a, s) => a + s.kg, 0)),
      r2(coops.sociedades.reduce((a, s) => a + s.qq, 0)),
      r2(coops.sociedades.reduce((a, s) => a + s.qq, 0) / LOTE_QQ),
      r2(coops.sociedades.reduce((a, s) => a + s.importe, 0)),
    ],
    [],
    [
      '', coops.individuales.nombre, coops.individuales.boletas,
      r2(coops.individuales.kg), r2(coops.individuales.qq),
      r2(coops.individuales.lotes), nz(coops.individuales.importe),
    ],
    [],
    [
      '', 'TOTAL ACOPIO', coops.total.boletas, r2(coops.total.kg),
      r2(coops.total.qq), r2(coops.total.lotes), r2(coops.total.importe),
    ],
  ]

  return {
    sheets: [
      { name: 'Concentrado', rows: concentrado },
      { name: 'QQ acopiados', rows: qq },
      { name: 'Cooperativas', rows: cooperativas },
    ],
    resumen: {
      boletas: boletas.length,
      qq: r2(qqAcopiados.total.qq),
      lotes: r2(qqAcopiados.total.qq / LOTE_QQ),
    },
  }
}
