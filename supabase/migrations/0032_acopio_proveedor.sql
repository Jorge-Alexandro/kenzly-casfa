-- ============================================================================
-- Kenzly CASFA — Padrón PROPIO de Acopio (proveedores)
-- ----------------------------------------------------------------------------
-- Los proveedores del acopio NO son los mismos del padrón de certificación:
-- hay empresas, acopiadores y productores externos. Se lleva su propia lista,
-- alimentada del Excel "CASFA ACOPIO" y con alta de nuevos desde la app.
-- Ejecutar después de 0031.
-- ============================================================================

create table if not exists acopio_proveedor (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizaciones(id) on delete cascade,
  nombre     text not null,
  comunidad  text,
  municipio  text,
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, nombre)
);
create index if not exists acopio_proveedor_org_idx on acopio_proveedor (org_id, nombre);

alter table acopio_proveedor enable row level security;
drop policy if exists org_read on acopio_proveedor;
create policy org_read on acopio_proveedor for select using (es_miembro(org_id));
drop policy if exists org_write on acopio_proveedor;
create policy org_write on acopio_proveedor for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on acopio_proveedor to authenticated;

-- Enlace opcional de la entrada al proveedor de acopio (además del snapshot).
alter table entradas
  add column if not exists acopio_proveedor_id uuid references acopio_proveedor(id) on delete set null;

notify pgrst, 'reload schema';
