-- ============================================================================
-- Kenzly CASFA — Folio consecutivo en fichas, bitácoras e historial
-- ----------------------------------------------------------------------------
-- Mismo mecanismo que ya usan entradas de acopio (0010) y listas de asistencia
-- (0044): un contador transaccional por organización, un folio por documento.
-- Cada tipo de documento tiene SU PROPIO contador — son documentos distintos
-- (Ficha #1, Bitácora #1, Historial #1 no son el mismo folio).
--
-- Ejecutar después de 0056.
-- ============================================================================

create table if not exists ficha_contador (
  org_id       uuid primary key references organizaciones(id) on delete cascade,
  ultimo_folio int not null default 0
);
alter table ficha_contador enable row level security;
drop policy if exists org_isolation on ficha_contador;
create policy org_isolation on ficha_contador
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ficha_contador to authenticated;

create table if not exists bitacora_contador (
  org_id       uuid primary key references organizaciones(id) on delete cascade,
  ultimo_folio int not null default 0
);
alter table bitacora_contador enable row level security;
drop policy if exists org_isolation on bitacora_contador;
create policy org_isolation on bitacora_contador
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on bitacora_contador to authenticated;

create table if not exists historial_contador (
  org_id       uuid primary key references organizaciones(id) on delete cascade,
  ultimo_folio int not null default 0
);
alter table historial_contador enable row level security;
drop policy if exists org_isolation on historial_contador;
create policy org_isolation on historial_contador
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on historial_contador to authenticated;

alter table fichas add column if not exists folio int;
alter table bitacora_anual add column if not exists folio int;
alter table historial_manejo_anual add column if not exists folio int;

-- Una función por tabla (mismo patrón que acopio_asignar_folio / asistencia):
-- más repetitivo que una genérica, pero evita SQL dinámico en un trigger.
create or replace function ficha_asignar_folio() returns trigger as $$
declare v_folio int;
begin
  if new.folio is not null and new.folio > 0 then
    return new;
  end if;
  insert into ficha_contador (org_id, ultimo_folio) values (new.org_id, 0)
    on conflict (org_id) do nothing;
  update ficha_contador set ultimo_folio = ultimo_folio + 1
   where org_id = new.org_id
  returning ultimo_folio into v_folio;
  new.folio := v_folio;
  return new;
end $$ language plpgsql;
drop trigger if exists trg_ficha_folio on fichas;
create trigger trg_ficha_folio before insert on fichas
  for each row execute function ficha_asignar_folio();

create or replace function bitacora_asignar_folio() returns trigger as $$
declare v_folio int;
begin
  if new.folio is not null and new.folio > 0 then
    return new;
  end if;
  insert into bitacora_contador (org_id, ultimo_folio) values (new.org_id, 0)
    on conflict (org_id) do nothing;
  update bitacora_contador set ultimo_folio = ultimo_folio + 1
   where org_id = new.org_id
  returning ultimo_folio into v_folio;
  new.folio := v_folio;
  return new;
end $$ language plpgsql;
drop trigger if exists trg_bitacora_folio on bitacora_anual;
create trigger trg_bitacora_folio before insert on bitacora_anual
  for each row execute function bitacora_asignar_folio();

create or replace function historial_asignar_folio() returns trigger as $$
declare v_folio int;
begin
  if new.folio is not null and new.folio > 0 then
    return new;
  end if;
  insert into historial_contador (org_id, ultimo_folio) values (new.org_id, 0)
    on conflict (org_id) do nothing;
  update historial_contador set ultimo_folio = ultimo_folio + 1
   where org_id = new.org_id
  returning ultimo_folio into v_folio;
  new.folio := v_folio;
  return new;
end $$ language plpgsql;
drop trigger if exists trg_historial_folio on historial_manejo_anual;
create trigger trg_historial_folio before insert on historial_manejo_anual
  for each row execute function historial_asignar_folio();

notify pgrst, 'reload schema';
