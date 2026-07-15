-- ============================================================================
-- Kenzly CASFA — Ventas: origen 'historico' para la migración del Excel
-- ----------------------------------------------------------------------------
-- Las ventas Ene–Abr 2026 vienen del Excel "Reporte de ventas 2026 - ENE ABR"
-- (scripts/seed-ventas-2026.mjs), no de un CFDI ni de captura manual:
--   - no tienen factura (factura_id null),
--   - NO descuentan inventario (el trigger trg_ventas_stock solo descuenta
--     origen 'manual'),
--   - se distinguen en el UI con su propio badge "Histórico".
-- Ejecutar después de 0018. Luego correr: node scripts/seed-ventas-2026.mjs
-- ============================================================================

alter table ventas_detalle
  drop constraint if exists ventas_detalle_origen_check;

alter table ventas_detalle
  add constraint ventas_detalle_origen_check
  check (origen in ('cfdi', 'manual', 'historico'));
