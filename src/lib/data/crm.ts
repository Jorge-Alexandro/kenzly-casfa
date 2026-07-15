// Módulo CRM — queries de servidor. RLS acota todo por organización.
// Server-only (jala next/headers vía el cliente Supabase de servidor);
// los tipos client-safe viven en lib/crm/tipos.ts.
import { createClient } from '@/lib/supabase/server'
import type {
  ActividadRow,
  ContactoRow,
  CuentaRow,
  EtapaHistorialRow,
  MiembroOrg,
  OportunidadItemRow,
  OportunidadRow,
  Ventas360,
} from '@/lib/crm/tipos'

export * from '@/lib/crm/tipos'

const CUENTA_COLS =
  'id, ventas_cliente_id, nombre, nombre_comercial, tipo, estatus, segmento, origen, ' +
  'telefono, email, sitio_web, direccion, responsable_id, notas, created_at, updated_at'

const OPORTUNIDAD_COLS =
  'id, cuenta_id, responsable_id, nombre, etapa, monto_estimado, probabilidad, ' +
  'fecha_cierre_estimada, origen, motivo_perdida, notas, ganado_at, perdido_at, ' +
  'created_at, updated_at, cuenta:crm_cuenta(id, nombre)'

// Los selects concatenados no dejan que supabase-js infiera el tipo de fila
// (mismo caso que data/ventas.ts): tipamos lo crudo a mano y casteamos.
type CuentaRaw = Omit<CuentaRow, 'ultima_actividad'>

// supabase-js entrega los embebidos a veces como objeto y a veces como arreglo.
type Embebido<T> = T | T[] | null

interface OportunidadRaw extends Omit<OportunidadRow, 'cuenta' | 'proxima_actividad'> {
  cuenta: Embebido<{ id: string; nombre: string }>
}

interface ActividadRaw extends Omit<ActividadRow, 'cuenta'> {
  cuenta: Embebido<{ id: string; nombre: string }>
}

function uno<T>(v: Embebido<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// Miembros de la org para asignar/mostrar responsables (RPC DEFINER porque el
// RLS de usuarios solo expone la fila propia — mismo gotcha que fichas).
export async function getMiembrosOrg(): Promise<MiembroOrg[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('crm_miembros_org')
  if (error) throw new Error(error.message)
  return (data ?? []) as MiembroOrg[]
}

export async function getCuentas(): Promise<CuentaRow[]> {
  const supabase = await createClient()
  const [{ data: cuentas, error }, { data: acts, error: aErr }] = await Promise.all([
    supabase.from('crm_cuenta').select(CUENTA_COLS).order('nombre'),
    supabase
      .from('crm_actividad')
      .select('cuenta_id, created_at')
      .order('created_at', { ascending: false }),
  ])
  if (error) throw new Error(error.message)
  if (aErr) throw new Error(aErr.message)

  // Última interacción por cuenta (la primera que aparece: vienen desc).
  const ultima = new Map<string, string>()
  for (const a of acts ?? []) {
    if (!ultima.has(a.cuenta_id)) ultima.set(a.cuenta_id, a.created_at)
  }
  return ((cuentas ?? []) as unknown as CuentaRaw[]).map((c) => ({
    ...c,
    ultima_actividad: ultima.get(c.id) ?? null,
  }))
}

export async function getOportunidades(): Promise<OportunidadRow[]> {
  const supabase = await createClient()
  const [{ data: opps, error }, { data: pendientes, error: pErr }] = await Promise.all([
    supabase.from('crm_oportunidad').select(OPORTUNIDAD_COLS).order('updated_at', { ascending: false }),
    supabase
      .from('crm_actividad')
      .select('oportunidad_id, asunto, fecha_programada')
      .is('completada_at', null)
      .not('oportunidad_id', 'is', null)
      .order('fecha_programada', { ascending: true, nullsFirst: false }),
  ])
  if (error) throw new Error(error.message)
  if (pErr) throw new Error(pErr.message)

  // Próxima actividad pendiente por oportunidad (la primera: vienen por fecha asc).
  const proxima = new Map<string, { asunto: string; fecha_programada: string | null }>()
  for (const a of pendientes ?? []) {
    if (a.oportunidad_id && !proxima.has(a.oportunidad_id)) {
      proxima.set(a.oportunidad_id, { asunto: a.asunto, fecha_programada: a.fecha_programada })
    }
  }
  return ((opps ?? []) as unknown as OportunidadRaw[]).map((o) => ({
    ...o,
    cuenta: uno(o.cuenta),
    proxima_actividad: proxima.get(o.id) ?? null,
  }))
}

// Actividades pendientes (para vencidas/próximas del dashboard).
export async function getActividadesPendientes(): Promise<ActividadRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('crm_actividad')
    .select(
      'id, cuenta_id, oportunidad_id, responsable_id, tipo, asunto, descripcion, ' +
        'fecha_programada, completada_at, resultado, created_at, cuenta:crm_cuenta(id, nombre)',
    )
    .is('completada_at', null)
    .order('fecha_programada', { ascending: true, nullsFirst: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as ActividadRaw[]).map((a) => ({
    ...a,
    cuenta: uno(a.cuenta),
  }))
}

export interface CuentaDetalle {
  cuenta: CuentaRow
  contactos: ContactoRow[]
  oportunidades: (OportunidadRow & { items: OportunidadItemRow[]; historial: EtapaHistorialRow[] })[]
  actividades: ActividadRow[]
  ventas360: Ventas360 | null
}

export async function getCuentaDetalle(id: string): Promise<CuentaDetalle | null> {
  const supabase = await createClient()
  const { data: cuenta, error } = await supabase
    .from('crm_cuenta')
    .select(CUENTA_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!cuenta) return null
  const cuentaRaw = cuenta as unknown as CuentaRaw

  const [contactos, opps, actividades] = await Promise.all([
    supabase
      .from('crm_contacto')
      .select('id, cuenta_id, nombre, puesto, telefono, email, whatsapp, principal, notas')
      .eq('cuenta_id', id)
      .order('principal', { ascending: false })
      .order('nombre'),
    supabase
      .from('crm_oportunidad')
      .select(OPORTUNIDAD_COLS)
      .eq('cuenta_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('crm_actividad')
      .select(
        'id, cuenta_id, oportunidad_id, responsable_id, tipo, asunto, descripcion, ' +
          'fecha_programada, completada_at, resultado, created_at',
      )
      .eq('cuenta_id', id)
      .order('created_at', { ascending: false }),
  ])
  if (contactos.error) throw new Error(contactos.error.message)
  if (opps.error) throw new Error(opps.error.message)
  if (actividades.error) throw new Error(actividades.error.message)

  const oppsRaw = (opps.data ?? []) as unknown as OportunidadRaw[]
  const actsRaw = (actividades.data ?? []) as unknown as Omit<ActividadRow, 'cuenta'>[]

  // Items e historial en segunda pasada: dependen de los ids de oportunidad.
  const oppIds = oppsRaw.map((o) => o.id)
  let itemsData: unknown[] = []
  let historialData: unknown[] = []
  if (oppIds.length > 0) {
    const [itemsRes, histRes] = await Promise.all([
      supabase
        .from('crm_oportunidad_item')
        .select(
          'id, oportunidad_id, producto_id, cantidad, precio_objetivo, importe, ' +
            'producto:ventas_producto(nombre, linea, unidad)',
        )
        .in('oportunidad_id', oppIds),
      supabase
        .from('crm_etapa_historial')
        .select('id, oportunidad_id, etapa_anterior, etapa_nueva, cambiado_por, created_at')
        .in('oportunidad_id', oppIds)
        .order('created_at', { ascending: false }),
    ])
    if (itemsRes.error) throw new Error(itemsRes.error.message)
    if (histRes.error) throw new Error(histRes.error.message)
    itemsData = itemsRes.data ?? []
    historialData = histRes.data ?? []
  }

  type ItemRaw = Omit<OportunidadItemRow, 'producto'> & {
    oportunidad_id: string
    producto: Embebido<{ nombre: string; linea: string; unidad: string }>
  }
  const itemsPorOpp = new Map<string, OportunidadItemRow[]>()
  for (const raw of itemsData as ItemRaw[]) {
    const fila = { ...raw, producto: uno(raw.producto) }
    const lista = itemsPorOpp.get(raw.oportunidad_id) ?? []
    lista.push(fila)
    itemsPorOpp.set(raw.oportunidad_id, lista)
  }
  const histPorOpp = new Map<string, EtapaHistorialRow[]>()
  for (const h of historialData as (EtapaHistorialRow & { oportunidad_id: string })[]) {
    const lista = histPorOpp.get(h.oportunidad_id) ?? []
    lista.push(h)
    histPorOpp.set(h.oportunidad_id, lista)
  }

  const ventas360 = cuentaRaw.ventas_cliente_id ? await getVentas360(cuentaRaw.ventas_cliente_id) : null

  return {
    cuenta: { ...cuentaRaw, ultima_actividad: actsRaw[0]?.created_at ?? null },
    contactos: (contactos.data ?? []) as ContactoRow[],
    oportunidades: oppsRaw.map((o) => ({
      ...o,
      cuenta: uno(o.cuenta),
      proxima_actividad: null,
      items: itemsPorOpp.get(o.id) ?? [],
      historial: histPorOpp.get(o.id) ?? [],
    })),
    actividades: actsRaw.map((a) => ({ ...a, cuenta: null })),
    ventas360,
  }
}

// Historial comercial REAL desde Ventas (fuente de verdad) para la ficha 360°.
export async function getVentas360(clienteId: string): Promise<Ventas360 | null> {
  const supabase = await createClient()
  const { data: cliente, error } = await supabase
    .from('ventas_cliente')
    .select('id, rfc, nombre')
    .eq('id', clienteId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!cliente) return null

  const [detalles, facturas, precios] = await Promise.all([
    supabase
      .from('ventas_detalle')
      .select('id, fecha, cantidad, importe, origen, producto:ventas_producto(nombre)')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false }),
    supabase
      .from('ventas_factura')
      .select('id, folio_interno, fecha, total, estado')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false })
      .limit(10),
    supabase
      .from('ventas_precio_cliente')
      .select('precio_acordado, vigente_desde, producto:ventas_producto(nombre)')
      .eq('cliente_id', clienteId)
      .order('vigente_desde', { ascending: false }),
  ])
  if (detalles.error) throw new Error(detalles.error.message)
  if (facturas.error) throw new Error(facturas.error.message)
  if (precios.error) throw new Error(precios.error.message)

  const filas = (detalles.data ?? []).map((d) => ({
    ...d,
    producto: Array.isArray(d.producto) ? (d.producto[0] ?? null) : d.producto,
  })) as unknown as { id: string; fecha: string; cantidad: number; importe: number; origen: string; producto: { nombre: string } | null }[]

  const total = filas.reduce((s, d) => s + Number(d.importe), 0)
  const porProducto = new Map<string, { nombre: string; cantidad: number; importe: number }>()
  for (const d of filas) {
    const nombre = d.producto?.nombre ?? '—'
    const fila = porProducto.get(nombre) ?? { nombre, cantidad: 0, importe: 0 }
    fila.cantidad += Number(d.cantidad)
    fila.importe += Number(d.importe)
    porProducto.set(nombre, fila)
  }

  // Precio acordado VIGENTE por producto (el más reciente; vienen desc).
  const precioVigente = new Map<string, { producto_nombre: string; precio_acordado: number; vigente_desde: string }>()
  for (const p of precios.data ?? []) {
    const prod = Array.isArray(p.producto) ? p.producto[0] : p.producto
    const nombre = (prod as { nombre: string } | null)?.nombre ?? '—'
    if (!precioVigente.has(nombre)) {
      precioVigente.set(nombre, {
        producto_nombre: nombre,
        precio_acordado: Number(p.precio_acordado),
        vigente_desde: p.vigente_desde,
      })
    }
  }

  return {
    cliente,
    total_comprado: total,
    num_ventas: filas.length,
    ultima_compra: filas[0]?.fecha ?? null,
    ticket_promedio: filas.length > 0 ? total / filas.length : 0,
    productos_habituales: Array.from(porProducto.values())
      .sort((a, b) => b.importe - a.importe)
      .slice(0, 8),
    precios_acordados: Array.from(precioVigente.values()),
    facturas_recientes: (facturas.data ?? []) as Ventas360['facturas_recientes'],
    ventas_recientes: filas.slice(0, 10).map((d) => ({
      id: d.id,
      fecha: d.fecha,
      producto_nombre: d.producto?.nombre ?? '—',
      cantidad: Number(d.cantidad),
      importe: Number(d.importe),
      origen: d.origen,
    })),
  }
}
