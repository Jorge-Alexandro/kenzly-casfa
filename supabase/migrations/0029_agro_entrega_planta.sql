-- ============================================================================
-- Kenzly CASFA — Agroecología: entregas de plantas POR PRODUCTOR
-- ----------------------------------------------------------------------------
-- El programa registraba las plantas entregadas por COMUNIDAD (agro_comunidad).
-- El SIC necesita el dato por PRODUCTOR para verificar en campo, durante la
-- inspección, si el productor sí está trabajando las plantas que recibió.
-- Una fila por (productor, año, especie).
-- Ejecutar después de 0028.
-- ============================================================================

create table if not exists agro_entrega_planta (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  productor_id  uuid not null references productores(id) on delete cascade,
  anio          int not null,
  especie       text not null,                  -- 'Café Robusta', 'Inga', 'Cedro'…
  cantidad      int not null default 0,
  fecha_entrega date,
  observaciones text,
  created_at    timestamptz not null default now()
);
create index if not exists agro_entrega_prod_idx on agro_entrega_planta (productor_id, anio);
create index if not exists agro_entrega_org_idx on agro_entrega_planta (org_id, anio);

alter table agro_entrega_planta enable row level security;
drop policy if exists org_read on agro_entrega_planta;
create policy org_read on agro_entrega_planta for select using (es_miembro(org_id));
drop policy if exists org_write on agro_entrega_planta;
create policy org_write on agro_entrega_planta for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on agro_entrega_planta to authenticated;

notify pgrst, 'reload schema';
