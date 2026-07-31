// Tipos del parser de CFDI de compra (cfdi-compra.mjs).

export interface EmisorCfdiCompra {
  rfc: string
  nombre: string
}

export interface FacturaCompraCfdi {
  fecha: string // YYYY-MM-DD
  total: number
  moneda: string | null
  folio: string | null
  uuidFiscal: string | null
  emisor: EmisorCfdiCompra
}

export function parsearCfdiCompra(xml: string): FacturaCompraCfdi
