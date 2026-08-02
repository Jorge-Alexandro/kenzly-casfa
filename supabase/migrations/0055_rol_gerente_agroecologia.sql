-- ============================================================================
-- Kenzly CASFA — Rol GERENTE_AGROECOLOGIA (Ing. Iván Romari)
-- ----------------------------------------------------------------------------
-- Ve el SIC completo (panel, geosic, satélite, productores, certificación,
-- lpa, certificados, estimación, fichas, bitácora, historial, asistencia,
-- agroecología) MÁS acopio y contratos — sin contabilidad, gastos, ventas,
-- inventario ni CRM. No hace falta tocar ninguna función RLS: acopio ya
-- protege el costo con es_contador('admin','contador') y este rol no está
-- en esa lista, así que ve las entradas pero no el precio, igual que
-- 'operativo' — el candado real es la RLS, no el nav.
--
-- `rol` es el enum rol_membresia; Postgres no deja usar un valor nuevo del
-- enum en la MISMA transacción en que se agrega, así que este archivo sólo
-- lo agrega — lib/acceso.ts es quien decide qué módulos ve.
--
-- Ejecutar después de 0054.
-- ============================================================================

alter type rol_membresia add value if not exists 'gerente_agroecologia';

notify pgrst, 'reload schema';
