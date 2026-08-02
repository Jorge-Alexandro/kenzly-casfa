-- ============================================================================
-- Ventas — Captura de venta desde cero (Diego/Liz), espejo exacto de
-- Contabilidad → Pagos y facturas (0038_pagos_facturas.sql: entrada_pago /
-- entrada_factura). Corrige el diseño anterior de este módulo, que asumía
-- que importar un CFDI era el evento que descontaba inventario.
--
-- El evento real es la VENTA que Diego/Liz capturan (ventas_pedido +
-- ventas_detalle, origen='manual' — el trigger de stock que YA existe desde
-- 0018 sigue intacto, no se toca). La factura es apenas EVIDENCIA fiscal
-- (folio/fecha/monto/uuid, igual que entrada_factura) que se liga DESPUÉS,
-- a mano o pre-llenada leyendo un XML/PDF — nunca vuelve a tocar inventario.
-- Esto resuelve solo los casos de cancelación/sustitución de CFDI que
-- describió gerencia: inventario y factura quedan desacoplados a propósito.
--
-- Ejecutar después de 0052.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- El pedido/venta: cliente + fecha + notas. Las líneas (qué se vendió) siguen
-- viviendo en ventas_detalle, ahora con pedido_id.
-- ----------------------------------------------------------------------------
create table if not exists ventas_pedido (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  cliente_id     uuid not null references ventas_cliente(id) on delete restrict,
  fecha          date not null default current_date,
  notas          text,
  estado         text not null default 'abierta' check (estado in ('abierta', 'cancelada')),
  motivo_cancelacion text,
  dias_credito   integer not null default 30,
  importe_pagado numeric(14,2) not null default 0,
  created_by     uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists ventas_pedido_org_fecha_idx on ventas_pedido (org_id, fecha desc);
create index if not exists ventas_pedido_cliente_idx on ventas_pedido (cliente_id);
alter table ventas_pedido enable row level security;
drop policy if exists org_isolation on ventas_pedido;
create policy org_isolation on ventas_pedido
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ventas_pedido to authenticated;

alter table ventas_detalle
  add column if not exists pedido_id uuid references ventas_pedido(id) on delete cascade;
create index if not exists ventas_detalle_pedido_idx on ventas_detalle (pedido_id);

-- ----------------------------------------------------------------------------
-- Pagos (abonos). Igual que entrada_pago: se capturan uno por uno, la suma
-- es la evidencia de cómo se fue cobrando.
-- ----------------------------------------------------------------------------
create table if not exists ventas_pago (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references ventas_pedido(id) on delete cascade,
  org_id         uuid not null references organizaciones(id) on delete cascade,
  fecha          date not null default current_date,
  monto          numeric(14,2) not null,
  metodo         text,
  referencia     text,
  observaciones  text,
  registrado_por uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (monto <> 0)
);
create index if not exists ventas_pago_pedido_idx on ventas_pago (pedido_id, fecha);
alter table ventas_pago enable row level security;
drop policy if exists org_isolation on ventas_pago;
create policy org_isolation on ventas_pago
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ventas_pago to authenticated;

-- ----------------------------------------------------------------------------
-- Facturas (evidencia fiscal). Igual que entrada_factura: folio/fecha/monto/
-- uuid, todo menos el folio es opcional — se puede capturar antes de tener
-- el CFDI timbrado. NUNCA toca ventas_detalle ni inventario.
-- ----------------------------------------------------------------------------
create table if not exists ventas_pedido_factura (
  id             uuid primary key default gen_random_uuid(),
  pedido_id      uuid not null references ventas_pedido(id) on delete cascade,
  org_id         uuid not null references organizaciones(id) on delete cascade,
  folio          text not null,
  fecha          date,
  monto          numeric(14,2),
  uuid_fiscal    text,
  observaciones  text,
  registrado_por uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists ventas_pedido_factura_pedido_idx on ventas_pedido_factura (pedido_id);
alter table ventas_pedido_factura enable row level security;
drop policy if exists org_isolation on ventas_pedido_factura;
create policy org_isolation on ventas_pedido_factura
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ventas_pedido_factura to authenticated;

-- ----------------------------------------------------------------------------
-- importe_pagado del pedido = SUMA de sus abonos (mismo patrón que
-- entrada_recalc_pagado). Se recalcula solo en cada alta/edición/baja de pago.
-- ----------------------------------------------------------------------------
create or replace function ventas_pedido_recalc_pagado(p_pedido uuid) returns void as $$
begin
  update ventas_pedido
     set importe_pagado = coalesce((select sum(monto) from ventas_pago where pedido_id = p_pedido), 0),
         updated_at = now()
   where id = p_pedido;
end $$ language plpgsql security definer set search_path = public;

create or replace function ventas_pago_touch() returns trigger as $$
begin
  perform ventas_pedido_recalc_pagado(coalesce(new.pedido_id, old.pedido_id));
  return null;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_ventas_pago_recalc on ventas_pago;
create trigger trg_ventas_pago_recalc
  after insert or update or delete on ventas_pago
  for each row execute function ventas_pago_touch();

notify pgrst, 'reload schema';
