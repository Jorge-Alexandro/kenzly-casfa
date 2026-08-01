// Qué módulos ve cada rol. FUENTE ÚNICA: la usan el nav (AppHeader) y la
// guardia por URL (middleware). Si sólo se ocultara la pestaña, cualquiera
// podría teclear /ventas y ver los montos.
//
// Módulo = primer segmento de la ruta ('/acopio/nueva' → 'acopio').

export type RolAcceso =
  | 'admin'
  | 'coordinador'
  | 'inspector'
  | 'solo_lectura'
  | 'contador'
  | 'operativo'

/** Sets de módulos por función, para no repetir listas. */
const SIC = [
  'panel', 'geosic', 'satelite', 'productores', 'certificacion', 'lpa',
  'certificados', 'estimacion', 'fichas', 'bitacora', 'historial', 'asistencia',
  'agroecologia',
] as const

const CONTABLE = [
  'panel', 'acopio', 'salidas', 'contabilidad', 'gastos', 'concentrado',
  'ventas', 'crm',
] as const

// Bodega: captura acopio y salidas. NADA de dinero — y el precio de venta
// además está protegido por RLS (es_contador), así que ni leyéndolo lo vería.
const OPERATIVO = ['acopio', 'salidas'] as const

const MODULOS_POR_ROL: Record<RolAcceso, readonly string[] | 'todos'> = {
  admin: 'todos',
  coordinador: SIC,
  inspector: SIC,
  solo_lectura: SIC,
  contador: CONTABLE,
  operativo: OPERATIVO,
}

/** Rutas que no pertenecen a ningún módulo y nunca se bloquean. */
const LIBRES = new Set(['login', 'offline', 'firmar', ''])

/** Primer segmento de la ruta ('/acopio/123' → 'acopio'). */
export function moduloDeRuta(pathname: string): string {
  return pathname.replace(/^\/+/, '').split('/')[0] ?? ''
}

/** ¿Este rol puede entrar a este módulo? */
export function puedeVerModulo(rol: RolAcceso | undefined, modulo: string): boolean {
  if (LIBRES.has(modulo)) return true
  if (!rol) return false
  const permitidos = MODULOS_POR_ROL[rol]
  if (permitidos === 'todos') return true
  return permitidos.includes(modulo)
}

/** Primer módulo al que sí tiene acceso: a dónde mandarlo si entra donde no debe. */
export function moduloInicial(rol: RolAcceso | undefined): string {
  if (!rol) return '/login'
  const permitidos = MODULOS_POR_ROL[rol]
  if (permitidos === 'todos') return '/panel'
  return `/${permitidos[0] ?? 'panel'}`
}
