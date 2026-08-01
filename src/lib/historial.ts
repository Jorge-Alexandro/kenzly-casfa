// Historial anual de manejo — mismos renglones y vocabulario que el formato
// real de CASFA ("HISTORIAL DEL MANEJO DEL PROGRAMA CAFÉ"): Estatus, Producto
// (Pergamino/Robusta), Balance de masa (café uva), fertilización, controles
// con sus opciones de casilla, abono verde y última aplicación de insumos.
// Cada (parcela, año) es un ciclo; la vista compara varios años en columnas.
//
// Los ids de los campos con datos ya capturados NO se tocan (estado_parcela,
// producto, control_*, produccion_estimada_kg…): cambiar un id pierde de
// vista lo que el SIC ya llenó, aunque el dato siga vivo en la base.

export type HistorialTipo = 'enum' | 'text' | 'number'

export interface HistorialCampo {
  id: string
  label: string
  tipo: HistorialTipo
  opciones?: string[]
  /** Solo con tipo 'enum': se puede marcar más de una casilla (valor = string[]). */
  multiple?: boolean
}

// Filas del historial (en el formato salen como renglones; las columnas son años).
export const HISTORIAL_CAMPOS: HistorialCampo[] = [
  // "Estatus" en el doc 2023-2024 (O/T3/T2/T1) y "Estado de la parcela" en el
  // doc 2024-2025 (Tradicional/Orgánico) son el mismo renglón con dos
  // vocabularios distintos entre ciclos — se dejan las dos listas juntas para
  // no perder lo que ya está capturado con la versión vieja.
  { id: 'estado_parcela', label: 'Estatus', tipo: 'enum', opciones: ['Orgánico', 'T3', 'T2', 'T1', 'Nuevo', 'Tradicional', 'En conversión'] },
  { id: 'producto', label: 'Producto', tipo: 'text' },
  // "Producto — Estimado Kg" del doc: pergamino de árabe y robusta van en
  // columnas separadas del mismo renglón.
  { id: 'producto_pergamino_kg', label: 'Producto: Café Pergamino — Estimado (kg)', tipo: 'number' },
  { id: 'producto_robusta_kg', label: 'Producto: Café Robusta — Estimado (kg)', tipo: 'number' },
  // "Balance de masa": el mismo estimado, pasado a café uva (cereza fresca).
  { id: 'balance_arabigo_uva_kg', label: 'Balance de masa: Café arábigo uva — Estimado (kg)', tipo: 'number' },
  { id: 'balance_robusta_uva_kg', label: 'Balance de masa: Café Robusta uva — Estimado (kg)', tipo: 'number' },
  { id: 'produccion_estimada_kg', label: 'Producción estimada (kg)', tipo: 'number' },
  { id: 'fertilizacion_composta_kg', label: 'Fertilización: composta (kg)', tipo: 'number' },
  { id: 'fertilizacion_fecha', label: 'Fertilización: fecha de aplicación', tipo: 'text' },
  { id: 'uso_estiercol', label: 'Uso de estiércol', tipo: 'enum', opciones: ['Sí', 'No'] },
  // Los tres controles son casillas independientes en el formato (se puede
  // marcar una, la otra, o ambas) — no una sola respuesta de texto libre.
  { id: 'control_plagas_broca', label: 'Control de plagas (broca)', tipo: 'enum', multiple: true, opciones: ['Pepena granos brocados', 'Aplicó insumos'] },
  { id: 'control_enfermedades', label: 'Control de enfermedades', tipo: 'enum', multiple: true, opciones: ['Regulando la sombra', 'Aplicó insumos'] },
  { id: 'control_hierbas', label: 'Control de hierbas', tipo: 'enum', multiple: true, opciones: ['Manual con machete', 'Aplicó insumos'] },
  { id: 'abono_verde', label: 'Abono verde: cultivo bajo sombra diversificada', tipo: 'enum', opciones: ['Sí', 'No'] },
  { id: 'ultima_aplicacion_quimicos', label: 'Fecha de última aplicación de insumos químicos o prohibidos', tipo: 'text' },
]

export const HISTORIAL_NOTA =
  'Todos los insumos usados o que se piensen usar durante el año en curso y los tres años anteriores tienen que estar especificados.'

// Valores de un año = { campoId: valor }. Los campos 'enum' con multiple:true
// guardan un arreglo de las opciones marcadas.
export type HistorialAnioDatos = Record<string, string | number | null | string[]>

export interface HistorialAnio {
  id: string // id de la fila historial_manejo_anual (vacío si es nuevo, sin guardar)
  anio: number
  datos: HistorialAnioDatos
}

export function anioVacio(anio: number): HistorialAnio {
  const datos: HistorialAnioDatos = {}
  for (const c of HISTORIAL_CAMPOS) datos[c.id] = c.multiple ? [] : null
  return { id: '', anio, datos }
}

/** Texto para imprimir el valor de una celda (los reportes en PDF lo usan). */
export function mostrarValorHistorial(v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  return v === null || v === undefined || v === '' ? '—' : String(v)
}
