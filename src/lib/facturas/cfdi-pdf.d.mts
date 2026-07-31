// Tipos del heurístico de texto de PDF (cfdi-pdf.mjs).

export interface CamposPdf {
  uuidFiscal: string | null
  folio: string | null
  fecha: string | null
  monto: number | null
  emisorRfc: string | null
  camposDetectados: number
  camposTotal: number
}

export function extraerDeTextoPdf(texto: string): CamposPdf
