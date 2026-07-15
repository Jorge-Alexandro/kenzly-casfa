// Tipos del motor puro de CFDI (cfdi.mjs). Igual que acopio/calculo.d.mts:
// import de .mjs busca .d.mts, no .d.ts.

export interface ConceptoCfdi {
  descripcion: string
  claveProdServ: string | null
  claveUnidad: string | null
  cantidad: number
  valorUnitario: number
  importe: number
  linea: string
}

export interface ReceptorCfdi {
  rfc: string
  nombre: string
  regimenFiscal: string | null
}

export interface FacturaCfdi {
  fecha: string // YYYY-MM-DD
  total: number
  folioInterno: string | null
  folioFiscal: string | null // UUID del TimbreFiscalDigital
  receptor: ReceptorCfdi
  conceptos: ConceptoCfdi[]
}

export const REGLAS_LINEA: ReadonlyArray<{ tokens: string[]; linea: string }>
export const LINEA_DEFAULT: string
export const LINEAS: string[]

export function clasificarLinea(descripcion: string): string
export function parsearCfdi(xml: string): FacturaCfdi
export function sumaConceptos(factura: FacturaCfdi): number
