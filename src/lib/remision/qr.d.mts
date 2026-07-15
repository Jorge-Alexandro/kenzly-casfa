// Tipos del generador de QR (qr.mjs).

/** El QR como un único path SVG; `modulos` es el lado del viewBox. */
export function qrPath(texto: string): { d: string; modulos: number }
