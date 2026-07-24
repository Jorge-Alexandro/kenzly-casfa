-- ============================================================================
-- Kenzly CASFA — Módulo 9: Salidas (programación de entregas)
-- ----------------------------------------------------------------------------
-- Acuerdo de la junta: controlar las salidas del almacén con guía, folio, fecha,
-- cliente, cantidad y responsable.
--
-- SEPARACIÓN DE RESPONSABILIDADES (lo que pidió la junta):
--   · Axel (operativo) registra ÚNICAMENTE la salida física del producto.
--   · Iván (Contabilidad) captura el PRECIO DE VENTA.
--   · "El personal operativo no debe conocer el precio de venta."
--
-- Por eso el precio vive en una tabla APARTE (salida_venta) con RLS es_contador,
-- igual que hicimos con el costo de compra en entrada_costo: no es que la app
-- esconda una columna, es que la fila no existe para el operativo.
--
-- Ojo: `salida` NO es lo mismo que `maquila_salida` (0025), que son los embarques
-- que salen de un corte de maquila. Ésta es la programación de entregas del
-- almacén, con su propio folio y su precio de venta.
--
-- Ejecutar después de 0036.
-- ============================================================================

do $$ begin
  create type estado_salida as enum ('programada', 'entregada', 'cancelada');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Salida física (la ve y captura el operativo; sin dinero)
-- ----------------------------------------------------------------------------
create table if not exists salida (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  folio          int not null,                   -- consecutivo visible por org
  fecha          date not null default current_date,
  guia           text,                           -- guía de salida
  cliente        text not null,                  -- cliente o destinatario
  destino        text,
  especie        text,                           -- ARABE | ROBUSTA | CACAO
  tipo           text,                           -- ORO | PERGAMINO | ...
  producto_texto text,                           -- descripción libre si no hay catálogo
  sacos          numeric(12,2) not null default 0,
  kg             numeric(14,2) not null default 0,
  quintales      numeric(14,3),
  responsable    text,                           -- quién entrega / responsable de la salida
  transporte     text,
  placas         text,
  observaciones  text,
  estado         estado_salida not null default 'programada',
  creado_por     uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, folio)
);
create index if not exists salida_org_fecha_idx on salida (org_id, fecha desc);

alter table salida enable row level security;
drop policy if exists org_isolation on salida;
create policy org_isolation on salida
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on salida to authenticated;

-- Folio consecutivo por organización (transaccional, igual que acopio).
create table if not exists salida_contador (
  org_id       uuid primary key references organizaciones(id) on delete cascade,
  ultimo_folio int not null default 0
);
alter table salida_contador enable row level security;
drop policy if exists org_isolation on salida_contador;
create policy org_isolation on salida_contador
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on salida_contador to authenticated;

create or replace function salida_asignar_folio() returns trigger as $$
declare v_folio int;
begin
  if new.folio is not null and new.folio > 0 then
    return new;
  end if;
  insert into salida_contador (org_id, ultimo_folio) values (new.org_id, 0)
    on conflict (org_id) do nothing;
  update salida_contador
     set ultimo_folio = ultimo_folio + 1
   where org_id = new.org_id
  returning ultimo_folio into v_folio;
  new.folio := v_folio;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_salida_folio on salida;
create trigger trg_salida_folio before insert on salida
  for each row execute function salida_asignar_folio();

-- ----------------------------------------------------------------------------
-- Precio de venta (SÓLO Contabilidad). El operativo no puede ni consultarla.
--   importe = precio_kg × kg  (lo calcula la app al guardar)
-- ----------------------------------------------------------------------------
create table if not exists salida_venta (
  salida_id       uuid primary key references salida(id) on delete cascade,
  org_id          uuid not null references organizaciones(id) on delete cascade,
  precio_kg       numeric(12,4),
  importe         numeric(16,2),
  moneda          text not null default 'MXN',
  importe_cobrado numeric(16,2) not null default 0,
  factura         text,
  observaciones   text,
  actualizado_por uuid references usuarios(id) on delete set null,
  updated_at      timestamptz not null default now()
);
create index if not exists salida_venta_org_idx on salida_venta (org_id);

alter table salida_venta enable row level security;
drop policy if exists solo_contabilidad on salida_venta;
create policy solo_contabilidad on salida_venta
  for all
  using (es_contador(org_id))
  with check (es_contador(org_id));
grant select, insert, update, delete on salida_venta to authenticated;

notify pgrst, 'reload schema';
