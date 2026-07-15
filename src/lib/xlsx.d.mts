// Tipos del escritor XLSX (implementación en xlsx.mjs).

export type CellValue = string | number | null | undefined

export interface Sheet {
  name: string
  rows: CellValue[][]
}

/** Construye un .xlsx multi-hoja y devuelve los bytes. */
export function buildXlsx(sheets: Sheet[]): Uint8Array
