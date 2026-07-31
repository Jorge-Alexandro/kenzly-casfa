// Tipos del lector de tags de CFDI (extraer.mjs).

export interface TagCfdi {
  name: string
  attrs: Record<string, string> & { __xmlns?: string }
}

export function extraerTags(xml: string): TagCfdi[]
