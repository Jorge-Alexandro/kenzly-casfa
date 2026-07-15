// Tipos y constantes CLIENT-SAFE del módulo CRM.
// (Regla del repo: nada de imports de servidor aquí — un Client Component que
// importe de data/crm.ts jala next/headers y rompe el build.)

export type EtapaOportunidad =
  | 'nuevo'
  | 'contactado'
  | 'calificado'
  | 'cotizacion'
  | 'negociacion'
  | 'ganado'
  | 'perdido'

// Orden canónico del pipeline (columnas del Kanban).
export const ETAPAS: EtapaOportunidad[] = [
  'nuevo', 'contactado', 'calificado', 'cotizacion', 'negociacion', 'ganado', 'perdido',
]

export const ETAPAS_ABIERTAS: EtapaOportunidad[] = [
  'nuevo', 'contactado', 'calificado', 'cotizacion', 'negociacion',
]

export const ETAPA_LABEL: Record<EtapaOportunidad, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  calificado: 'Calificado',
  cotizacion: 'Cotización',
  negociacion: 'Negociación',
  ganado: 'Ganado',
  perdido: 'Perdido',
}

export const ETAPA_BADGE: Record<EtapaOportunidad, string> = {
  nuevo: 'bg-slate-100 text-slate-600',
  contactado: 'bg-sky-50 text-sky-700',
  calificado: 'bg-indigo-50 text-indigo-700',
  cotizacion: 'bg-amber-50 text-amber-700',
  negociacion: 'bg-orange-50 text-orange-700',
  ganado: 'bg-emerald-50 text-emerald-700',
  perdido: 'bg-rose-50 text-rose-700',
}

// Probabilidad sugerida al mover de etapa (editable en la oportunidad).
export const PROBABILIDAD_SUGERIDA: Record<EtapaOportunidad, number> = {
  nuevo: 10,
  contactado: 25,
  calificado: 45,
  cotizacion: 60,
  negociacion: 80,
  ganado: 100,
  perdido: 0,
}

export type TipoActividad = 'llamada' | 'visita' | 'correo' | 'whatsapp' | 'tarea' | 'nota'

export const TIPOS_ACTIVIDAD: TipoActividad[] = [
  'llamada', 'visita', 'correo', 'whatsapp', 'tarea', 'nota',
]

export const TIPO_ACTIVIDAD_LABEL: Record<TipoActividad, string> = {
  llamada: 'Llamada',
  visita: 'Visita',
  correo: 'Correo',
  whatsapp: 'WhatsApp',
  tarea: 'Tarea',
  nota: 'Nota',
}

export type TipoCuenta = 'prospecto' | 'cliente'
export type EstatusCuenta = 'activo' | 'inactivo' | 'descartado'

export const TIPO_CUENTA_LABEL: Record<TipoCuenta, string> = {
  prospecto: 'Prospecto',
  cliente: 'Cliente',
}

export const TIPO_CUENTA_BADGE: Record<TipoCuenta, string> = {
  prospecto: 'bg-sky-50 text-sky-700',
  cliente: 'bg-emerald-50 text-emerald-700',
}

export const ESTATUS_CUENTA_LABEL: Record<EstatusCuenta, string> = {
  activo: 'Activo',
  inactivo: 'Inactivo',
  descartado: 'Descartado',
}

// Miembro de la org (RPC crm_miembros_org) — para asignar/mostrar responsables.
export interface MiembroOrg {
  id: string
  nombre: string | null
  email: string | null
}

export function nombreMiembro(m: MiembroOrg | null | undefined): string {
  return m?.nombre ?? m?.email ?? '—'
}

export interface CuentaRow {
  id: string
  ventas_cliente_id: string | null
  nombre: string
  nombre_comercial: string | null
  tipo: TipoCuenta
  estatus: EstatusCuenta
  segmento: string | null
  origen: string | null
  telefono: string | null
  email: string | null
  sitio_web: string | null
  direccion: string | null
  responsable_id: string | null
  notas: string | null
  created_at: string
  updated_at: string
  // enriquecidos por la capa de datos
  ultima_actividad: string | null
}

// Payload de alta/edición de cuenta (formulario → API).
export interface CuentaEdit {
  nombre: string
  nombre_comercial: string | null
  tipo: TipoCuenta
  estatus: EstatusCuenta
  segmento: string | null
  origen: string | null
  telefono: string | null
  email: string | null
  sitio_web: string | null
  direccion: string | null
  responsable_id: string | null
  notas: string | null
}

export interface ContactoRow {
  id: string
  cuenta_id: string
  nombre: string
  puesto: string | null
  telefono: string | null
  email: string | null
  whatsapp: string | null
  principal: boolean
  notas: string | null
}

export interface OportunidadItemRow {
  id: string
  producto_id: string
  cantidad: number
  precio_objetivo: number
  importe: number
  producto: { nombre: string; linea: string; unidad: string } | null
}

export interface OportunidadRow {
  id: string
  cuenta_id: string
  responsable_id: string | null
  nombre: string
  etapa: EtapaOportunidad
  monto_estimado: number
  probabilidad: number
  fecha_cierre_estimada: string | null
  origen: string | null
  motivo_perdida: string | null
  notas: string | null
  ganado_at: string | null
  perdido_at: string | null
  created_at: string
  updated_at: string
  // enriquecidos por la capa de datos
  cuenta: { id: string; nombre: string } | null
  proxima_actividad: { asunto: string; fecha_programada: string | null } | null
}

export interface ActividadRow {
  id: string
  cuenta_id: string
  oportunidad_id: string | null
  responsable_id: string | null
  tipo: TipoActividad
  asunto: string
  descripcion: string | null
  fecha_programada: string | null
  completada_at: string | null
  resultado: string | null
  created_at: string
  cuenta: { id: string; nombre: string } | null
}

export interface EtapaHistorialRow {
  id: string
  etapa_anterior: EtapaOportunidad | null
  etapa_nueva: EtapaOportunidad
  cambiado_por: string | null
  created_at: string
}

// Resumen de Ventas para la ficha 360° (solo si la cuenta está vinculada a
// un ventas_cliente). Se arma en servidor desde ventas_detalle/factura/precio.
export interface Ventas360 {
  cliente: { id: string; rfc: string; nombre: string }
  total_comprado: number
  num_ventas: number
  ultima_compra: string | null
  ticket_promedio: number
  productos_habituales: { nombre: string; cantidad: number; importe: number }[]
  precios_acordados: { producto_nombre: string; precio_acordado: number; vigente_desde: string }[]
  facturas_recientes: { id: string; folio_interno: string | null; fecha: string; total: number; estado: string }[]
  ventas_recientes: { id: string; fecha: string; producto_nombre: string; cantidad: number; importe: number; origen: string }[]
}
