// Kenzly GeoOps — TypeScript types matching casfa_core_schema.sql
// Internal names: snake_case, no accents (mirrors DB canonical names)

export type TipoCultivo = 'cafe' | 'tropical' | 'mixto'
export type TipoFicha = 'robusta' | 'arabe' | 'tropicales'
export type EstadoFicha = 'borrador' | 'en_revision' | 'aprobada' | 'pdf_generado' | 'requiere_correccion'
export type RolMembresia = 'admin' | 'coordinador' | 'inspector' | 'solo_lectura'
export type MetodoLevantamiento = 'google_earth' | 'gps' | 'qgis' | 'otro'

export type EstadoValidacion =
  | 'sin_poligono'
  | 'cargado_sin_area'
  | 'pendiente'
  | 'validado_preliminar'
  | 'revisar_area'
  | 'diferencia_critica'
  | 'validado'
  | 'requiere_nuevo_levantamiento'

// Colors for map + badges keyed by EstadoValidacion
export const ESTADO_COLOR: Record<EstadoValidacion, string> = {
  validado: '#22c55e',
  validado_preliminar: '#86efac',
  revisar_area: '#f59e0b',
  diferencia_critica: '#ef4444',
  sin_poligono: '#64748b',
  cargado_sin_area: '#64748b',
  pendiente: '#94a3b8',
  requiere_nuevo_levantamiento: '#f97316',
}

export const ESTADO_LABEL: Record<EstadoValidacion, string> = {
  validado: 'Validado',
  validado_preliminar: 'Preliminar',
  revisar_area: 'Revisar área',
  diferencia_critica: 'Crítico',
  sin_poligono: 'Sin polígono',
  cargado_sin_area: 'Sin área',
  pendiente: 'Pendiente',
  requiere_nuevo_levantamiento: 'Nuevo levantamiento',
}

// Row returned by the get_parcelas_geo RPC (flat join of parcelas + productores + parcela_poligonos)
export interface ParcelaGeoRow {
  id: string
  codigo_parcela: string
  nombre: string | null
  tipo_cultivo: TipoCultivo
  superficie_declarada_ha: number | null
  comunidad: string | null
  municipio: string | null
  // producer fields
  productor_id: string
  productor_codigo: string
  productor_nombre: string
  productor_comunidad: string | null
  productor_municipio: string | null
  // polygon scalars (null when sin_poligono)
  poligono_id: string | null
  area_calc_ha: number | null
  perimetro_m: number | null
  diferencia_ha: number | null
  diferencia_pct: number | null
  estado_validacion: EstadoValidacion
  centroide_lat: number | null
  centroide_lng: number | null
  fecha_levantamiento: string | null
  archivo_kml_url: string | null
}

// GeoJSON polygon feature used by the map layer
export interface ParcelaPolygonFeature {
  parcela_id: string
  geojson: GeoJSON.Polygon
}

// Aggregated stats for the indicator bar
export interface GeoStats {
  total: number
  con_poligono: number
  validadas: number
  diferencia_critica: number
  sin_poligono: number
}

export function calcularStats(parcelas: ParcelaGeoRow[]): GeoStats {
  return {
    total: parcelas.length,
    con_poligono: parcelas.filter((p) => p.poligono_id !== null).length,
    validadas: parcelas.filter((p) => p.estado_validacion === 'validado').length,
    diferencia_critica: parcelas.filter((p) => p.estado_validacion === 'diferencia_critica').length,
    sin_poligono: parcelas.filter((p) => p.estado_validacion === 'sin_poligono').length,
  }
}

// Row returned by get_productores_dashboard RPC (Modulo 2)
export interface ProductorDashboardRow {
  id: string
  codigo: string
  nombre_completo: string
  comunidad: string | null
  municipio: string | null
  tipo_productor: TipoCultivo
  num_parcelas: number
  hectareas_totales: number
  parcelas_con_poligono: number
  parcelas_validadas: number
  num_fichas: number
  ultima_inspeccion: string | null
}

// Full productor record (catalog row)
export interface Productor {
  id: string
  org_id: string
  codigo: string
  nombre_completo: string
  comunidad: string | null
  municipio: string | null
  sexo: string | null
  anio_ingreso: number | null
  tipo_productor: TipoCultivo
}

// Parcela row with its productive extension + active polygon status, for the
// productor detail view.
export interface ParcelaDetalle {
  id: string
  codigo_parcela: string
  nombre: string | null
  comunidad: string | null
  municipio: string | null
  tipo_cultivo: TipoCultivo
  superficie_declarada_ha: number | null
  // geo (from active polygon, null if none)
  estado_validacion: EstadoValidacion
  area_calc_ha: number | null
  diferencia_pct: number | null
  // café extension (null for tropical)
  superficie_arabica_ha: number | null
  superficie_robusta_ha: number | null
  // tropical extension
  superficie_2025_ha: number | null
  cultivos: { cultivo?: string; arboles?: number; prod_kg?: number }[] | null
}

export interface ProductorDetalle {
  productor: Productor
  parcelas: ParcelaDetalle[]
}

// Fields the user is allowed to edit on a productor.
export interface ProductorEdit {
  nombre_completo: string
  comunidad: string | null
  municipio: string | null
  sexo: string | null
  anio_ingreso: number | null
}

// Fields the user is allowed to edit on a parcela.
export interface ParcelaEdit {
  nombre: string | null
  comunidad: string | null
  municipio: string | null
  superficie_declarada_ha: number | null
}

// --- Motor de fichas (Modulo 3) ---

export type CampoTipo =
  | 'enum'
  | 'text'
  | 'longtext'
  | 'number'
  | 'date'
  | 'signature'
  | 'bool'

export interface FormCampo {
  id: string
  nombre_interno: string
  etiqueta: string
  tipo: CampoTipo
  opciones: string[] | null
  requerido: boolean
  orden: number
  imagen_referencia_url: string | null
}

export interface FormSeccion {
  id: string
  nombre: string
  orden: number
  campos: FormCampo[]
}

export interface FormTemplate {
  id: string
  tipo_cultivo: TipoCultivo
  nombre: string
  version: number
  secciones: FormSeccion[]
}

// Lite productor for the capture selector
export interface ProductorLite {
  id: string
  codigo: string
  nombre_completo: string
  tipo_productor: TipoCultivo
}

// Lite parcela for the capture selector
export interface ParcelaLite {
  id: string
  productor_id: string
  codigo_parcela: string
  nombre: string | null
  tipo_cultivo: TipoCultivo
  superficie_declarada_ha: number | null
}

// A saved ficha row (list view)
export interface FichaListRow {
  id: string
  tipo: TipoFicha
  estado: EstadoFicha
  fecha_inspeccion: string | null
  productor_nombre: string
  productor_codigo: string
  num_parcelas: number
  area_cultivada_ha: number | null
  created_at: string
}

// Full ficha for the detail/print view.
export interface FichaDetalle {
  ficha: {
    id: string
    tipo: TipoFicha
    estado: EstadoFicha
    fecha_inspeccion: string | null
    area_cultivada_ha: number | null
    resultado_evaluacion: string | null
    created_at: string
    respuestas: Record<string, string | number | null>
  }
  productor: {
    nombre_completo: string
    codigo: string
    comunidad: string | null
    municipio: string | null
  }
  inspector_nombre: string | null
  parcelas: {
    id: string
    codigo_parcela: string
    nombre: string | null
    superficie_declarada_ha: number | null
  }[]
  template: FormTemplate | null
  // Bitácora vinculada a esta ficha (anexo), si existe.
  bitacora: { id: string; parcela_id: string; anio: number; datos: unknown } | null
}

export const ESTADO_FICHA_LABEL: Record<EstadoFicha, string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  aprobada: 'Aprobada',
  pdf_generado: 'PDF generado',
  requiere_correccion: 'Requiere corrección',
}

export const TIPO_FICHA_LABEL: Record<TipoFicha, string> = {
  robusta: 'Café Robusta',
  arabe: 'Café Arábica',
  tropicales: 'Cultivos Tropicales',
}

// café fichas use café parcelas; tropicales use tropical parcelas
export const TIPO_FICHA_CULTIVO: Record<TipoFicha, TipoCultivo> = {
  robusta: 'cafe',
  arabe: 'cafe',
  tropicales: 'tropical',
}

// User + org session (stored in context)
export interface UserSession {
  userId: string
  email: string
  nombre: string | null
  orgId: string
  orgNombre: string
  orgSlug: string
  rol: RolMembresia
}
