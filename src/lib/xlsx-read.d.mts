// Tipos del lector XLSX (xlsx-read.mjs). Contraparte de xlsx.mjs (escritor).

/** Celda: texto, número, booleano, fecha, o vacía. */
export type CeldaXlsx = string | number | boolean | Date | null

export interface LibroXlsx {
  nombres: string[]
  hojas: Record<string, CeldaXlsx[][]>
  hoja(nombre: string): CeldaXlsx[][] | null
}

export function leerXlsx(datos: ArrayBuffer | Uint8Array): LibroXlsx
export function celda(filas: CeldaXlsx[][], fila: number, col: number): CeldaXlsx
