// Bitácora anual — estructura fija tomada del formato real de CASFA.
// Café y tropical comparten el mismo grid.

export interface BitacoraActividad {
  id: string
  nombre: string
  grupo: 'manejo' | 'cosecha'
  // Campos auxiliares que el formato pide junto a algunas actividades.
  detalle?: string // p.ej. VIVERO: N° de plantas / variedad ; ABONAR: materiales
  gastos: number | null
  marcas: boolean[] // 24 = 12 meses × 2 quincenas (15 / 30)
}

export interface BitacoraInsumo {
  nombre_producto: string
  ingrediente_activo: string
  ingredientes_inertes: string
  origen: string
  dosis_kg_ha: string
  fecha_aplicacion: string
}

export interface BitacoraDatos {
  actividades: BitacoraActividad[]
  insumos: BitacoraInsumo[]
  observaciones: string
}

export interface BitacoraAnual {
  id: string
  parcela_id: string
  anio: number
  datos: BitacoraDatos
}

// Meses y quincenas (24 columnas).
export const MESES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
]
export const QUINCENAS = 2 // 15 / 30
export const NUM_COLUMNAS = MESES.length * QUINCENAS // 24

// Actividades predefinidas (con su detalle auxiliar cuando aplica).
const PLANTILLA_ACTIVIDADES: Omit<BitacoraActividad, 'gastos' | 'marcas'>[] = [
  { id: 'limpia', nombre: 'Limpia', grupo: 'manejo' },
  { id: 'poda', nombre: 'Poda', grupo: 'manejo' },
  { id: 'agobiar', nombre: 'Agobiar', grupo: 'manejo' },
  { id: 'resiembra', nombre: 'Resiembra', grupo: 'manejo' },
  { id: 'deshijar', nombre: 'Deshijar', grupo: 'manejo' },
  { id: 'regulacion_sombra', nombre: 'Regulación de sombra', grupo: 'manejo' },
  { id: 'vivero', nombre: 'Vivero (N° de plantas / variedad)', grupo: 'manejo', detalle: '' },
  { id: 'abonar', nombre: 'Abonar (materiales)', grupo: 'manejo', detalle: '' },
  { id: 'limpieza_beneficio', nombre: 'Limpieza del beneficio húmedo', grupo: 'cosecha' },
  { id: 'fecha_cosecha', nombre: 'Fecha de cosecha', grupo: 'cosecha' },
  { id: 'conservacion_suelos', nombre: 'Conservación de suelos', grupo: 'cosecha' },
]

// Crea un grid vacío (todas las actividades, sin marcas).
export function bitacoraVacia(): BitacoraDatos {
  return {
    actividades: PLANTILLA_ACTIVIDADES.map((a) => ({
      ...a,
      gastos: null,
      marcas: Array(NUM_COLUMNAS).fill(false),
    })),
    insumos: [emptyInsumo()],
    observaciones: '',
  }
}

export function emptyInsumo(): BitacoraInsumo {
  return {
    nombre_producto: '',
    ingrediente_activo: '',
    ingredientes_inertes: '',
    origen: '',
    dosis_kg_ha: '',
    fecha_aplicacion: '',
  }
}

// Normaliza datos cargados (por si faltan actividades nuevas o campos).
export function normalizarDatos(raw: Partial<BitacoraDatos> | null): BitacoraDatos {
  const base = bitacoraVacia()
  if (!raw) return base

  // Mezcla por id de actividad para preservar lo guardado y añadir nuevas.
  const guardadas = new Map(
    (raw.actividades ?? []).map((a) => [a.id, a]),
  )
  const actividades = base.actividades.map((a) => {
    const g = guardadas.get(a.id)
    if (!g) return a
    return {
      ...a,
      detalle: g.detalle ?? a.detalle,
      gastos: g.gastos ?? null,
      marcas:
        Array.isArray(g.marcas) && g.marcas.length === NUM_COLUMNAS
          ? g.marcas
          : a.marcas,
    }
  })

  return {
    actividades,
    insumos: raw.insumos && raw.insumos.length > 0 ? raw.insumos : [emptyInsumo()],
    observaciones: raw.observaciones ?? '',
  }
}
