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

  // ── QQ acopiados: una hoja de resumen + una hoja por tipo de café ────────
  // (mismo formato de pestañas que ve Francisco en la app).
  const resumenQQ: CellValue[][] = [
    ['QQ ACOPIADOS — RESUMEN'],
    ['Periodo', periodo],
    [],
    ['TIPO DE CAFÉ', 'BOLETAS', 'KILOS NETOS', 'QQ', 'IMPORTE'],
    ...qqAcopiados.tipos.map((x) => {
      const c = qqAcopiados.totalPorTipo[x]
      return [x, c?.boletas ?? 0, nz(c?.kg ?? 0), nz(c?.qq ?? 0), nz(c?.importe ?? 0)]
    }),
    [
      'TOTAL CAFÉ', qqAcopiados.total.boletas,
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

  // Una hoja por tipo de café: sus meses con kilos, quintales e importe.
  const hojasPorTipo: Sheet[] = qqAcopiados.tipos.map((tipo) => {
    const filas = qqAcopiados.filas
      .filter((f) => f.porTipo[tipo])
      .map((f) => {
        const c = f.porTipo[tipo]!
        return [f.mes, c.boletas, r2(c.kg), r2(c.qq), r2(c.importe)] as CellValue[]
      })
    const tot = qqAcopiados.totalPorTipo[tipo]
    return {
      name: nombreHoja(tipo),
      rows: [
        [`QQ ACOPIADOS — ${tipo}`],
        ['Periodo', periodo],
        [],
        ['MES', 'BOLETAS', 'KILOS NETOS', 'QQ', 'IMPORTE'],
        ...filas,
        ['TOTAL', tot?.boletas ?? 0, r2(tot?.kg ?? 0), r2(tot?.qq ?? 0), r2(tot?.importe ?? 0)],
      ],
    }
  })

  // ── Cooperativas ─────────────────────────────────────────────────────────
  const cooperativas: CellValue[][] = [
    ['ACOPIO POR COOPERATIVA'],
    ['Periodo', periodo],
    ['Lote', `${LOTE_QQ} qq`],
    [],
    ['#', 'SOCIEDAD', 'BOLETAS', 'CAFÉ KG', 'CAFÉ QQ', 'LOTES', 'CACAO KG', 'IMPORTE'],
    ...coops.sociedades.map((s, i) => [
      i + 1, s.nombre, s.boletas, r2(s.cafe_kg), r2(s.cafe_qq), r2(s.lotes), nz(s.cacao_kg), nz(s.importe),
    ]),
    [
      '', 'TOTAL COOPERATIVAS',
      coops.sociedades.reduce((a, s) => a + s.boletas, 0),
      r2(coops.sociedades.reduce((a, s) => a + s.cafe_kg, 0)),
      r2(coops.sociedades.reduce((a, s) => a + s.cafe_qq, 0)),
      r2(coops.sociedades.reduce((a, s) => a + s.cafe_qq, 0) / LOTE_QQ),
      r2(coops.sociedades.reduce((a, s) => a + s.cacao_kg, 0)),
      r2(coops.sociedades.reduce((a, s) => a + s.importe, 0)),
    ],
    [],
    [
      '', coops.individuales.nombre, coops.individuales.boletas,
      r2(coops.individuales.cafe_kg), r2(coops.individuales.cafe_qq),
      r2(coops.individuales.lotes), nz(coops.individuales.cacao_kg), nz(coops.individuales.importe),
    ],
    [],
    [
      '', 'TOTAL ACOPIO', coops.total.boletas, r2(coops.total.cafe_kg),
      r2(coops.total.cafe_qq), r2(coops.total.lotes), r2(coops.total.cacao_kg), r2(coops.total.importe),
    ],
  ]

  return {
    sheets: [
      { name: 'Concentrado', rows: concentrado },
      { name: 'QQ resumen', rows: resumenQQ },
      ...hojasPorTipo,
      { name: 'Cooperativas', rows: cooperativas },
    ],
    resumen: {
      boletas: boletas.length,
      qq: r2(qqAcopiados.total.qq),
      lotes: r2(qqAcopiados.total.qq / LOTE_QQ),
    },
  }
}

/** Excel no acepta : \ / ? * [ ] en el nombre de la hoja, y tope de 31. */
function nombreHoja(n: string) {
  return n.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31)
}
