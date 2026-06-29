-- ============================================================================
-- Kenzly GeoOps — Vincular bitácora ↔ ficha (una bitácora por ficha)
-- ----------------------------------------------------------------------------
-- La bitácora puede existir suelta (por parcela/año) o vinculada a una ficha de
-- inspección (anexo). Separamos la unicidad con índices parciales:
--   - suelta:    una por (parcela_id, año) cuando ficha_id IS NULL
--   - vinculada: una por ficha cuando ficha_id IS NOT NULL
-- Ejecutar después de 0006.
-- ============================================================================

alter table bitacora_anual
  add column if not exists ficha_id uuid references fichas(id) on delete cascade;

-- Quitar la unicidad rígida (parcela_id, año) creada inline en 0006.
alter table bitacora_anual
  drop constraint if exists bitacora_anual_parcela_id_anio_key;

-- Una bitácora suelta por parcela/año.
create unique index if not exists bitacora_suelta_uniq
  on bitacora_anual (parcela_id, anio)
  where ficha_id is null;

-- Una bitácora por ficha.
create unique index if not exists bitacora_ficha_uniq
  on bitacora_anual (ficha_id)
  where ficha_id is not null;
