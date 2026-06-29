// Historial anual de manejo — campos del formato real de CASFA.
// Cada (parcela, año) es un ciclo; la vista compara varios años en columnas.

export type HistorialTipo = 'enum' | 'text' | 'number'

export interface HistorialCampo {
  id: string
  label: string
  tipo: HistorialTipo
  opciones?: string[]
}

// Filas del historial (en el formato salen como renglones; las columnas son años).
export const HISTORIAL_CAMPOS: HistorialCampo[] = [
  { id: 'estado_parcela', label: 'Estado de la parcela', tipo: 'enum', opciones: ['Tradicional', 'En conversión', 'Orgánico'] },
  { id: 'producto', label: 'Producto', tipo: 'text' },
  { id: 'produccion_estimada_kg', label: 'Producción estimada (kg)', tipo: 'number' },
  { id: 'fertilizacion_composta_kg', label: 'Fertilización: composta (kg)', tipo: 'number' },
  { id: 'fertilizacion_fecha', label: 'Fertilización: fecha de aplicación', tipo: 'text' },
  { id: 'uso_estiercol', label: 'Uso de estiércol', tipo: 'enum', opciones: ['Sí', 'No'] },
  { id: 'control_plagas_broca', label: 'Control de plagas (broca)', tipo: 'text' },
  { id: 'control_enfermedades', label: 'Control de enfermedades', tipo: 'text' },
  { id: 'control_hierbas', label: 'Control de hierbas', tipo: 'text' },
  { id: 'abono_verde', label: 'Abono verde (cultivo bajo sombra diversificada)', tipo: 'enum', opciones: ['Sí', 'No'] },
  { id: 'ultima_aplicacion_quimicos', label: 'Fecha de última aplicación de insumos químicos o prohibidos', tipo: 'text' },
]

export const HISTORIAL_NOTA =
  'Todos los insumos usados o que se piensen usar durante el año en curso y los tres años anteriores tienen que estar especificados.'

// Valores de un año = { campoId: valor }
export type HistorialAnioDatos = Record<string, string | number | null>

export interface HistorialAnio {
  id: string // id de la fila historial_manejo_anual (vacío si es nuevo, sin guardar)
  anio: number
  datos: HistorialAnioDatos
}

export function anioVacio(anio: number): HistorialAnio {
  const datos: HistorialAnioDatos = {}
  for (const c of HISTORIAL_CAMPOS) datos[c.id] = null
  return { id: '', anio, datos }
}
