// Agroecología — Talleres (evento + plantilla): tipos puros (client-safe).
// El acceso a datos vive en src/lib/data/agro-talleres.ts (server only).

/** El texto fijo del formato, una vez por (programa, tipo de taller). */
export interface PlantillaTaller {
  id: string
  programa_id: string
  tipo_taller_id: string
  nombre_taller: string
  participantes: string | null
  asesores: string | null
  introduccion: string | null
  objetivo_general: string | null
  objetivos_especificos: string[]
  ficha_descriptiva: string[]
  desarrollo: string | null
  acuerdos: string | null
  conclusiones: string | null
  origen_archivo: string | null
}

/** El evento: lo único que se captura por reunión. */
export interface Taller {
  id: string
  programa_id: string
  tipo_taller_id: string
  comunidad_id: string | null
  comunidad: string
  municipio: string | null
  fecha: string
  hora_inicio: string | null
  hora_fin: string | null
  tecnico: string | null
  notas: string | null
  observaciones: string | null
  lista_id: string | null
  historico: boolean
  origen_archivo: string | null
}

export interface TallerFoto {
  id: string
  url: string
  descripcion: string | null
  orden: number
}

/** Fila para el listado: el taller + lo mínimo del tipo/programa para mostrar. */
export interface TallerRow extends Taller {
  tipo_nombre: string
  programa_nombre: string
  n_fotos: number
  n_asistentes: number | null // null = sin lista de asistencia enlazada
}

export interface TallerDetalle {
  taller: Taller
  tipo_nombre: string
  programa_nombre: string
  plantilla: PlantillaTaller | null
  fotos: TallerFoto[]
  asistentes: { nombre_completo: string; sexo: string | null; organizacion: string | null }[]
}

/** Marcadores que el generador sustituye en el texto de la plantilla. */
export function sustituirMarcadores(texto: string | null, t: Taller): string {
  if (!texto) return ''
  const fechaLarga = fechaLargaEs(t.fecha)
  return texto
    .replaceAll('{comunidad}', t.comunidad)
    .replaceAll('{municipio}', t.municipio ?? '')
    .replaceAll('{fecha_larga}', fechaLarga)
    .replaceAll('{tecnico}', t.tecnico ?? '')
    .replaceAll('{hora_inicio}', t.hora_inicio ?? '')
    .replaceAll('{hora_fin}', t.hora_fin ?? '')
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** '2023-08-08' → 'martes 08 de agosto del 2023' (como el formato original). */
export function fechaLargaEs(fechaISO: string): string {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dia = DIAS[dt.getUTCDay()]
  return `${dia} ${String(d).padStart(2, '0')} de ${MESES[m - 1]} del ${y}`
}
