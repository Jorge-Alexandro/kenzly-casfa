-- ============================================================================
-- Kenzly CASFA — Rol VENTAS (Diego Iván)
-- ----------------------------------------------------------------------------
-- Diego captura ventas, atiende inventario de producto terminado y trabaja el
-- CRM comercial — nada de acopio, costos, gastos ni contabilidad.
--
-- `rol` es el enum rol_membresia; Postgres no deja usar un valor nuevo del enum
-- en la MISMA transacción en que se agrega (por eso este archivo sólo agrega
-- el valor — lo que lo usa va en 0052, después de que éste ya haya corrido).
--
-- Ejecutar después de 0050.
-- ============================================================================

alter type rol_membresia add value if not exists 'ventas';

notify pgrst, 'reload schema';
