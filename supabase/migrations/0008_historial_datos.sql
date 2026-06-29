-- ============================================================================
-- Kenzly GeoOps — Historial anual de manejo: campo datos (JSONB)
-- ----------------------------------------------------------------------------
-- El historial real de CASFA compara año en curso + 3 anteriores (requisito de
-- certificación orgánica). Cada (parcela, año) guarda el manejo de ese ciclo.
-- Añadimos `datos` JSONB para el set completo de campos del formato, sin perder
-- las columnas canónicas existentes. Ejecutar después de 0007.
-- ============================================================================

alter table historial_manejo_anual
  add column if not exists datos jsonb not null default '{}'::jsonb;

-- Asegurar acceso a usuarios autenticados (RLS org_isolation ya existe).
grant select, insert, update, delete on historial_manejo_anual to authenticated;
