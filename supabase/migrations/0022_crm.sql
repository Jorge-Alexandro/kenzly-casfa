-- ============================================================================
-- Kenzly CASFA — Módulo 6: CRM comercial B2B (pipeline de prospección)
-- ----------------------------------------------------------------------------
-- Administra el proceso PREVIO a la venta:
--   Prospecto → Contactado → Calificado → Cotización → Negociación → Ganado/Perdido
-- Ventas (0018) sigue siendo la fuente de verdad de operaciones cerradas,
-- CFDI e ingresos reales. Por eso:
--   - crm_cuenta NO reutiliza ventas_cliente (esa tabla es de clientes
--     FISCALES y exige RFC; un prospecto no tiene). El puente es
--     crm_cuenta.ventas_cliente_id, que se llena al ganar/vincular.
--   - Ganar una oportunidad NUNCA inserta en ventas_detalle/ventas_factura.
--
-- Seguridad (más estricta que los módulos anteriores, que validan rol solo
-- en el API): aquí la BD también distingue lectura de escritura.
--   - SELECT: cualquier miembro de la org (es_miembro, como siempre).
--   - INSERT/UPDATE/DELETE: solo admin/coordinador (es_editor_comercial,
--     SECURITY DEFINER sobre membresias — inspector y solo_lectura quedan
--     bloqueados aunque llamen a Supabase directo, no solo por el API).
--   - Cruce de organizaciones: FKs COMPUESTAS (hijo.padre_id, hijo.org_id)
--     → padre(id, org_id); es imposible colgar un contacto/oportunidad de
--     una cuenta de otra org aunque se adivine el uuid.
--
-- crm_etapa_historial se escribe SOLO por trigger (función DEFINER); el rol
-- authenticated ni siquiera tiene grant de insert.
--
-- Ejecutar después de 0021.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper de rol: ¿el usuario actual es admin/coordinador de la org?
-- DEFINER para leer membresias saltando su RLS (mismo patrón que es_miembro).
-- ----------------------------------------------------------------------------
create or replace function es_editor_comercial(org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from membresias m
    where m.org_id = org
      and m.usuario_id = auth.uid()
      and m.rol in ('admin', 'coordinador')
  );
$$;

-- Miembros de mi org (id + nombre/email) para elegir/mostrar responsables.
-- Necesario porque el RLS de usuarios solo expone la fila propia.
create or replace function crm_miembros_org()
returns table (id uuid, nombre text, email text)
language sql stable security definer set search_path = public
as $$
  select u.id, u.nombre, u.email
  from usuarios u
  join membresias m on m.usuario_id = u.id
  where m.org_id in (
    select org_id from membresias where usuario_id = auth.uid()
  )
  order by coalesce(u.nombre, u.email);
$$;
grant execute on function crm_miembros_org() to authenticated;

-- updated_at automático (compartido por cuenta y oportunidad).
create or replace function crm_touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end $$ language plpgsql;

-- ----------------------------------------------------------------------------
-- Para las FKs compuestas hacia Ventas: (id, org_id) deben ser únicos en las
-- tablas referenciadas. Aditivo — no altera nada ya aplicado de 0018.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ventas_cliente_id_org_uk') then
    alter table ventas_cliente add constraint ventas_cliente_id_org_uk unique (id, org_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ventas_producto_id_org_uk') then
    alter table ventas_producto add constraint ventas_producto_id_org_uk unique (id, org_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. Cuentas comerciales (prospectos y clientes). Sin RFC: eso vive en
--    ventas_cliente y se vincula vía ventas_cliente_id al formalizarse.
-- ----------------------------------------------------------------------------
create table if not exists crm_cuenta (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizaciones(id) on delete cascade,
  ventas_cliente_id  uuid,
  nombre             text not null,
  nombre_comercial   text,
  tipo               text not null default 'prospecto' check (tipo in ('prospecto', 'cliente')),
  estatus            text not null default 'activo' check (estatus in ('activo', 'inactivo', 'descartado')),
  segmento           text,
  origen             text,
  telefono           text,
  email              text,
  sitio_web          text,
  direccion          text,
  responsable_id     uuid references usuarios(id) on delete set null,
  notas              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, org_id),
  -- misma org que el cliente fiscal vinculado; al borrar el cliente solo se
  -- anula el vínculo (columna explícita: si no, SET NULL anularía org_id)
  foreign key (ventas_cliente_id, org_id) references ventas_cliente(id, org_id)
    on delete set null (ventas_cliente_id)
);
-- Un cliente fiscal se refleja en UNA sola cuenta CRM por org.
create unique index if not exists crm_cuenta_ventas_cliente_uk
  on crm_cuenta (org_id, ventas_cliente_id) where ventas_cliente_id is not null;
create index if not exists crm_cuenta_org_idx on crm_cuenta (org_id, estatus, tipo);

drop trigger if exists trg_crm_cuenta_touch on crm_cuenta;
create trigger trg_crm_cuenta_touch before update on crm_cuenta
  for each row execute function crm_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Contactos de una cuenta.
-- ----------------------------------------------------------------------------
create table if not exists crm_contacto (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizaciones(id) on delete cascade,
  cuenta_id  uuid not null,
  nombre     text not null,
  puesto     text,
  telefono   text,
  email      text,
  whatsapp   text,
  principal  boolean not null default false,
  notas      text,
  created_at timestamptz not null default now(),
  foreign key (cuenta_id, org_id) references crm_cuenta(id, org_id) on delete cascade
);
create index if not exists crm_contacto_cuenta_idx on crm_contacto (cuenta_id);
-- A lo más un contacto principal por cuenta (el API des-marca al anterior).
create unique index if not exists crm_contacto_principal_uk
  on crm_contacto (cuenta_id) where principal;

-- ----------------------------------------------------------------------------
-- 3. Oportunidades. probabilidad en % entero (0–100); el valor ponderado
--    (monto × probabilidad/100) se calcula en código, no se almacena.
-- ----------------------------------------------------------------------------
create table if not exists crm_oportunidad (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references organizaciones(id) on delete cascade,
  cuenta_id              uuid not null,
  responsable_id         uuid references usuarios(id) on delete set null,
  nombre                 text not null,
  etapa                  text not null default 'nuevo' check (etapa in
                           ('nuevo','contactado','calificado','cotizacion','negociacion','ganado','perdido')),
  monto_estimado         numeric(14,2) not null default 0 check (monto_estimado >= 0),
  probabilidad           integer not null default 50 check (probabilidad between 0 and 100),
  fecha_cierre_estimada  date,
  origen                 text,
  motivo_perdida         text,
  notas                  text,
  ganado_at              timestamptz,
  perdido_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, org_id),
  foreign key (cuenta_id, org_id) references crm_cuenta(id, org_id) on delete cascade,
  -- perder exige explicar por qué (el UI lo pide en el modal de etapa)
  check (etapa <> 'perdido' or motivo_perdida is not null)
);
create index if not exists crm_oportunidad_org_etapa_idx on crm_oportunidad (org_id, etapa);
create index if not exists crm_oportunidad_cuenta_idx    on crm_oportunidad (cuenta_id);

-- Sella ganado_at/perdido_at según la etapa y mantiene updated_at.
create or replace function crm_oportunidad_touch() returns trigger as $$
declare etapa_cambio boolean;
begin
  if (tg_op = 'UPDATE') then
    new.updated_at := now();
    etapa_cambio := new.etapa is distinct from old.etapa;
  else
    etapa_cambio := true; -- INSERT: old no existe en plpgsql
  end if;
  if etapa_cambio then
    if new.etapa = 'ganado' then
      new.ganado_at  := coalesce(new.ganado_at, now());
      new.perdido_at := null;
    elsif new.etapa = 'perdido' then
      new.perdido_at := coalesce(new.perdido_at, now());
      new.ganado_at  := null;
    else
      new.ganado_at  := null;
      new.perdido_at := null;
      new.motivo_perdida := null; -- reabierta: el motivo ya no aplica
    end if;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_crm_oportunidad_touch on crm_oportunidad;
create trigger trg_crm_oportunidad_touch before insert or update on crm_oportunidad
  for each row execute function crm_oportunidad_touch();

-- ----------------------------------------------------------------------------
-- 4. Productos de interés de la oportunidad. Reusa el catálogo de Ventas
--    (ventas_producto); importe lo calcula la BD, no el cliente.
-- ----------------------------------------------------------------------------
create table if not exists crm_oportunidad_item (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizaciones(id) on delete cascade,
  oportunidad_id  uuid not null,
  producto_id     uuid not null,
  cantidad        numeric(14,3) not null check (cantidad > 0),
  precio_objetivo numeric(14,2) not null check (precio_objetivo >= 0),
  importe         numeric(14,2) generated always as (round(cantidad * precio_objetivo, 2)) stored,
  created_at      timestamptz not null default now(),
  unique (oportunidad_id, producto_id),
  foreign key (oportunidad_id, org_id) references crm_oportunidad(id, org_id) on delete cascade,
  foreign key (producto_id, org_id)    references ventas_producto(id, org_id) on delete restrict
);
create index if not exists crm_oportunidad_item_op_idx on crm_oportunidad_item (oportunidad_id);

-- ----------------------------------------------------------------------------
-- 5. Actividades (llamada/visita/correo/whatsapp/tarea/nota). Pendiente si
--    completada_at es null; vencida si además fecha_programada < now().
-- ----------------------------------------------------------------------------
create table if not exists crm_actividad (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizaciones(id) on delete cascade,
  cuenta_id        uuid not null,
  oportunidad_id   uuid,
  responsable_id   uuid references usuarios(id) on delete set null,
  tipo             text not null check (tipo in ('llamada','visita','correo','whatsapp','tarea','nota')),
  asunto           text not null,
  descripcion      text,
  fecha_programada timestamptz,
  completada_at    timestamptz,
  resultado        text,
  created_at       timestamptz not null default now(),
  foreign key (cuenta_id, org_id)      references crm_cuenta(id, org_id) on delete cascade,
  foreign key (oportunidad_id, org_id) references crm_oportunidad(id, org_id)
    on delete set null (oportunidad_id)
);
create index if not exists crm_actividad_cuenta_idx    on crm_actividad (cuenta_id, created_at desc);
create index if not exists crm_actividad_pendiente_idx on crm_actividad (org_id, fecha_programada)
  where completada_at is null;

-- ----------------------------------------------------------------------------
-- 6. Historial de etapas — SOLO lo escribe el trigger (DEFINER); sin grant de
--    escritura para authenticated. Queda el rastro aunque cambie el UI.
-- ----------------------------------------------------------------------------
create table if not exists crm_etapa_historial (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  oportunidad_id uuid not null,
  etapa_anterior text,
  etapa_nueva    text not null,
  cambiado_por   uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now(),
  foreign key (oportunidad_id, org_id) references crm_oportunidad(id, org_id) on delete cascade
);
create index if not exists crm_etapa_historial_op_idx on crm_etapa_historial (oportunidad_id, created_at desc);

create or replace function crm_log_etapa()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    insert into crm_etapa_historial (org_id, oportunidad_id, etapa_anterior, etapa_nueva, cambiado_por)
      values (new.org_id, new.id, null, new.etapa, auth.uid());
  elsif (new.etapa is distinct from old.etapa) then
    insert into crm_etapa_historial (org_id, oportunidad_id, etapa_anterior, etapa_nueva, cambiado_por)
      values (new.org_id, new.id, old.etapa, new.etapa, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_crm_log_etapa on crm_oportunidad;
create trigger trg_crm_log_etapa after insert or update on crm_oportunidad
  for each row execute function crm_log_etapa();

-- ----------------------------------------------------------------------------
-- RLS: lectura = miembro; escritura = admin/coordinador. El historial es de
-- solo lectura para todos (lo llena el trigger DEFINER).
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['crm_cuenta','crm_contacto','crm_oportunidad','crm_oportunidad_item','crm_actividad']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists crm_select on %I', t);
    execute format('create policy crm_select on %I for select using (es_miembro(org_id))', t);
    execute format('drop policy if exists crm_insert on %I', t);
    execute format('create policy crm_insert on %I for insert with check (es_editor_comercial(org_id))', t);
    execute format('drop policy if exists crm_update on %I', t);
    execute format('create policy crm_update on %I for update using (es_editor_comercial(org_id)) with check (es_editor_comercial(org_id))', t);
    execute format('drop policy if exists crm_delete on %I', t);
    execute format('create policy crm_delete on %I for delete using (es_editor_comercial(org_id))', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

alter table crm_etapa_historial enable row level security;
drop policy if exists crm_select on crm_etapa_historial;
create policy crm_select on crm_etapa_historial for select using (es_miembro(org_id));
grant select on crm_etapa_historial to authenticated;
