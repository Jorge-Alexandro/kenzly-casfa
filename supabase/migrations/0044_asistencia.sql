-- ============================================================================
-- Kenzly CASFA — Listas de asistencia (eventos, talleres, auditorías)
-- ----------------------------------------------------------------------------
-- Digitaliza el "FORMATO LISTA DE ASISTENCIA". Cada lista tiene un folio
-- consecutivo por organización; al llegar, cada participante se registra
-- (nombre, organización, cargo, firma…) y todos aparecen en la misma lista.
-- Sirve para dejar constancia de quién auditó / asistió a cada evento.
--
-- Ejecutar después de 0043.
-- ============================================================================

-- Contador de folio por organización (transaccional, no MAX+1 suelto).
create table if not exists asistencia_contador (
  org_id       uuid primary key references organizaciones(id) on delete cascade,
  ultimo_folio int not null default 0
);
alter table asistencia_contador enable row level security;
drop policy if exists org_isolation on asistencia_contador;
create policy org_isolation on asistencia_contador
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on asistencia_contador to authenticated;

-- Encabezado de la lista.
create table if not exists asistencia_lista (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  folio         int not null,
  nombre_evento text not null,
  fecha         date not null default current_date,
  lugar         text,
  capacitador   text,
  cerrada       boolean not null default false,
  created_by    uuid references usuarios(id),
  created_at    timestamptz not null default now(),
  unique (org_id, folio)
);
create index if not exists asistencia_lista_org_idx on asistencia_lista (org_id, created_at desc);

alter table asistencia_lista enable row level security;
drop policy if exists org_read on asistencia_lista;
create policy org_read on asistencia_lista for select using (es_miembro(org_id));
drop policy if exists org_write on asistencia_lista;
create policy org_write on asistencia_lista for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on asistencia_lista to authenticated;

-- Un registro por participante.
create table if not exists asistencia_registro (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizaciones(id) on delete cascade,
  lista_id        uuid not null references asistencia_lista(id) on delete cascade,
  numero          int not null,
  nombre_completo text not null,
  organizacion    text,
  sexo            text,
  cargo           text,
  telefono        text,
  correo          text,
  firma_url       text,               -- data URL de la firma capturada
  created_at      timestamptz not null default now()
);
create index if not exists asistencia_registro_lista_idx on asistencia_registro (lista_id, numero);

alter table asistencia_registro enable row level security;
drop policy if exists org_read on asistencia_registro;
create policy org_read on asistencia_registro for select using (es_miembro(org_id));
drop policy if exists org_write on asistencia_registro;
create policy org_write on asistencia_registro for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on asistencia_registro to authenticated;

-- Folio consecutivo por organización al crear una lista.
create or replace function asistencia_asignar_folio() returns trigger as $$
declare v_folio int;
begin
  if new.folio is not null and new.folio > 0 then
    return new;
  end if;
  insert into asistencia_contador (org_id, ultimo_folio) values (new.org_id, 0)
    on conflict (org_id) do nothing;
  update asistencia_contador
     set ultimo_folio = ultimo_folio + 1
   where org_id = new.org_id
  returning ultimo_folio into v_folio;
  new.folio := v_folio;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_asistencia_folio on asistencia_lista;
create trigger trg_asistencia_folio before insert on asistencia_lista
  for each row execute function asistencia_asignar_folio();

-- Número consecutivo del participante dentro de su lista.
create or replace function asistencia_asignar_numero() returns trigger as $$
declare v_num int;
begin
  if new.numero is not null and new.numero > 0 then
    return new;
  end if;
  select coalesce(max(numero), 0) + 1 into v_num
    from asistencia_registro where lista_id = new.lista_id;
  new.numero := v_num;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_asistencia_numero on asistencia_registro;
create trigger trg_asistencia_numero before insert on asistencia_registro
  for each row execute function asistencia_asignar_numero();

notify pgrst, 'reload schema';
