// Tipos del generador/validador de códigos de etiqueta (codigo.mjs).

export function digitoDamm(digitos: string | number): number
export function armarCodigo(prefijo: string, ciclo: string, consecutivo: number): string
/** Devuelve el código canónico, o null si el dígito verificador no cuadra. */
export function validarCodigo(texto: string): string | null
export function generarRango(
  prefijo: string,
  ciclo: string,
  desde: number,
  cantidad: number,
): { consecutivo: number; codigo: string }[]
