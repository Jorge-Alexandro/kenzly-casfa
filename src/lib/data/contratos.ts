// Módulo 8 — Contratos de fijación: consultas del lado servidor.
// RLS acota por organización; nunca pasamos org_id del cliente. Los tipos puros
// viven en @/lib/contratos/tipos (client-safe).
import { createClient } from '@/lib/supabase/server'
import type {
  ContratoRow,
  ContratoDetalle,
  ContratoConfig,
  ContratoPlantilla,
  VendedorLite,
} from '@/lib/contratos/tipos'

export * from '@/lib/contratos/tipos'

const ROW_COLS =
  'id, folio, fecha, vendedor_nombre, comunidad, municipio, especie, tipo,' +
  ' cantidad, unidad, precio_unitario, moneda, importe, quintales, factor_quintal,' +
  ' arbitraje, estado'

const DETALLE_COLS =
  ROW_COLS +
  ', ciclo, productor_id, vendedor_domicilio, vendedor_curp, vendedor_rfc,' +
  ' vendedor_telefono, anticipo, fecha_entrega, calidad_texto, costalera_texto,' +
  ' condiciones_texto, arbitraje_texto, lugar_firma, firma_vendedor_url,' +
  ' firma_comprador_url, firmado_vendedor_at, firmado_comprador_at, firma_token, observaciones'

export async function getContratos(): Promise<ContratoRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contrato_fijacion')
    .select(ROW_COLS)
    .order('folio', { ascending: false })
    .limit(1000)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ContratoRow[]
}

export async function getContrato(id: string): Promise<ContratoDetalle | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contrato_fijacion')
    .select(DETALLE_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as unknown as ContratoDetalle) ?? null
}

/**
 * Contrato + config para la LIGA DE FIRMA REMOTA (pública, sin sesión).
 * Usa la llave de servicio porque el vendedor no tiene cuenta; el acceso lo da
 * el token (capacidad no adivinable). Devuelve sólo lo necesario para mostrar y
 * firmar el contrato — nada de otras filas de la organización.
 */
export async function getContratoPorToken(
  token: string,
): Promise<{ contrato: ContratoDetalle; config: ContratoConfig | null } | null> {
  const { createClient: createAdmin } = await import('@supabase/supabase-js')
  const db = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await db
    .from('contrato_fijacion')
    .select(DETALLE_COLS + ', org_id')
    .eq('firma_token', token)
    .maybeSingle()
  if (error || !data) return null

  const { data: cfg } = await db
    .from('contrato_config')
    .select(
      'razon_social, rfc, domicilio_fiscal, representante_nombre, representante_cargo,' +
        ' firma_representante_url, arbitraje_nacional_texto, arbitraje_internacional_texto, lugar_firma',
    )
    .eq('org_id', (data as unknown as { org_id: string }).org_id)
    .maybeSingle()

  return {
    contrato: data as unknown as ContratoDetalle,
    config: (cfg as unknown as ContratoConfig) ?? null,
  }
}

export async function getConfig(): Promise<ContratoConfig | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contrato_config')
    .select(
      'razon_social, rfc, domicilio_fiscal, representante_nombre, representante_cargo,' +
        ' firma_representante_url, arbitraje_nacional_texto, arbitraje_internacional_texto, lugar_firma',
    )
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as unknown as ContratoConfig) ?? null
}

/**
 * Padrón de vendedores = el de ACOPIO (`acopio_proveedor`), el mismo que se usa
 * al capturar una entrada. No el de certificación: a quien se le compra el café
 * es a quien se le hace el contrato, y buena parte son empresas.
 */
export async function getVendedores(): Promise<VendedorLite[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('acopio_proveedor')
    .select('id, nombre, comunidad, municipio')
    .eq('activo', true)
    .order('nombre', { ascending: true })
    .limit(5000)
  if (error) throw new Error(error.message)
  return (data ?? []).map((p) => ({
    id: p.id as string,
    nombre_completo: p.nombre as string,
    comunidad: (p.comunidad ?? null) as string | null,
    municipio: (p.municipio ?? null) as string | null,
  }))
}

export async function getPlantillas(): Promise<ContratoPlantilla[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contrato_plantilla')
    .select(
      'especie, tipo, nombre, unidad, moneda, factor_quintal, calidad_texto,' +
        ' costalera_texto, condiciones_texto',
    )
    .eq('activo', true)
    .order('especie', { ascending: true })
    .order('tipo', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ContratoPlantilla[]
}
