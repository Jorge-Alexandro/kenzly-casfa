// Helpers de presentación.

// El codigo_parcela de la migración viene como "<codigo><Nombre>" pegados
// (p.ej. "CR015007Los Rosales") y ese formato es necesario para la unicidad por
// productor. Para MOSTRARLO limpio recortamos el nombre del final — sin tocar el
// dato. Devuelve solo el código (p.ej. "CR015007").
export function codigoCorto(
  codigoParcela: string,
  nombre: string | null,
): string {
  const c = (codigoParcela ?? '').trim()
  const n = (nombre ?? '').trim()
  if (!n) return c
  if (c.toLowerCase().endsWith(n.toLowerCase())) {
    return c.slice(0, c.length - n.length).trim()
  }
  return c
}
