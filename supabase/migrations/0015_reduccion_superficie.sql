-- ============================================================================
-- Kenzly CASFA — SIC: Reducción de Superficie (3ª hoja del LPA)
-- ----------------------------------------------------------------------------
-- El LPA lleva una hoja con los productores que redujeron superficie de un
-- ciclo al siguiente (ha anterior vs actual y cuánto redujo). Se modela como
-- registro (como las bajas) y se puebla con scripts/import-lpa.py desde el LPA.
-- Ejecutar después de 0014.
-- ============================================================================

create table if not exists reduccion_superficie (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  productor_id   uuid not null references productores(id) on delete cascade,
  ciclo_anterior text,
  ciclo_actual   text,
  ha_anterior    numeric(12,2),
  ha_actual      numeric(12,2),
  redujo         numeric(12,2),
  created_at     timestamptz not null default now(),
  unique (productor_id)
);
create index if not exists reduccion_superficie_org_idx on reduccion_superficie (org_id);

alter table reduccion_superficie enable row level security;
drop policy if exists org_isolation on reduccion_superficie;
create policy org_isolation on reduccion_superficie
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on reduccion_superficie to authenticated;

-- Recarga el cache de PostGREST para que vea la tabla nueva de inmediato.
notify pgrst, 'reload schema';
