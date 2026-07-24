-- ============================================================================
-- Contabilidad: pagos parciales y facturas por boleta
-- ----------------------------------------------------------------------------
-- Vicky: "cuando le pongo el precio, hay veces que no se paga ni se factura todo
-- al contado; necesito ir capturando los diferentes pagos, y que se muestren como
-- evidencia de lo que ya se lleva pagado. Lo mismo las facturas."
--
-- Antes el costo tenía UN importe_pagado y UNA factura sueltos. Eso obliga a
-- pisar el dato cada abono y pierde el rastro de cómo se fue pagando. Ahora:
--   entrada_pago    → un renglón por abono (fecha, monto, método, referencia)
--   entrada_factura → un renglón por factura (folio, fecha, monto, UUID CFDI)
--
-- `entrada_costo.importe_pagado` NO desaparece: se queda como TOTAL CACHEADO y
-- lo mantiene un trigger sumando los abonos. Así los reportes y el Excel que ya
-- existen siguen funcionando sin cambios, y el detalle vive en la tabla nueva
-- (mismo patrón que los totales de la entrada vs sus pesadas).
--
-- Las dos tablas llevan RLS es_contador: son dinero, el operativo no las ve.
-- Ejecutar después de 0037.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Abonos
-- ----------------------------------------------------------------------------
create table if not exists entrada_pago (
  id             uuid primary key default gen_random_uuid(),
  entrada_id     uuid not null references entradas(id) on delete cascade,
  org_id         uuid not null references organizaciones(id) on delete cascade,
  fecha          date not null default current_date,
  monto          numeric(16,2) not null,
  metodo         text,                  -- efectivo | transferencia | cheque | depósito
  referencia     text,                  -- folio de transferencia, cheque, etc.
  observaciones  text,
  registrado_por uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now(),
  check (monto <> 0)
);
create index if not exists entrada_pago_entrada_idx on entrada_pago (entrada_id, fecha);

alter table entrada_pago enable row level security;
drop policy if exists solo_contabilidad on entrada_pago;
create policy solo_contabilidad on entrada_pago
  for all using (es_contador(org_id)) with check (es_contador(org_id));
grant select, insert, update, delete on entrada_pago to authenticated;

-- ----------------------------------------------------------------------------
-- Facturas
-- ----------------------------------------------------------------------------
create table if not exists entrada_factura (
  id            uuid primary key default gen_random_uuid(),
  entrada_id    uuid not null references entradas(id) on delete cascade,
  org_id        uuid not null references organizaciones(id) on delete cascade,
  folio         text not null,          -- folio/serie de la factura
  fecha         date,
  monto         numeric(16,2),
  uuid_fiscal   text,                   -- UUID del CFDI, si se tiene
  observaciones text,
  registrado_por uuid references usuarios(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists entrada_factura_entrada_idx on entrada_factura (entrada_id);

alter table entrada_factura enable row level security;
drop policy if exists solo_contabilidad on entrada_factura;
create policy solo_contabilidad on entrada_factura
  for all using (es_contador(org_id)) with check (es_contador(org_id));
grant select, insert, update, delete on entrada_factura to authenticated;

-- ----------------------------------------------------------------------------
-- El total pagado de la boleta = SUMA de sus abonos (pura agregación, como los
-- totales de la entrada). Si aún no hay fila de costo, se crea para no perder
-- el abono (se puede pagar un anticipo antes de fijar el precio).
-- ----------------------------------------------------------------------------
create or replace function entrada_recalc_pagado(p_entrada uuid, p_org uuid)
returns void as $$
begin
  insert into entrada_costo (entrada_id, org_id) values (p_entrada, p_org)
    on conflict (entrada_id) do nothing;

  update entrada_costo c
     set importe_pagado = coalesce((
           select sum(monto) from entrada_pago p where p.entrada_id = p_entrada
         ), 0),
         updated_at = now()
   where c.entrada_id = p_entrada;
end $$ language plpgsql security definer set search_path = public;

create or replace function entrada_pago_touch() returns trigger as $$
begin
  perform entrada_recalc_pagado(
    coalesce(new.entrada_id, old.entrada_id),
    coalesce(new.org_id, old.org_id)
  );
  return null;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_entrada_pago_recalc on entrada_pago;
create trigger trg_entrada_pago_recalc
  after insert or update or delete on entrada_pago
  for each row execute function entrada_pago_touch();

-- ----------------------------------------------------------------------------
-- Migrar lo que ya se hubiera capturado en los campos sueltos, para no perderlo.
-- ----------------------------------------------------------------------------
insert into entrada_factura (entrada_id, org_id, folio)
select c.entrada_id, c.org_id, c.factura
  from entrada_costo c
 where c.factura is not null and btrim(c.factura) <> ''
   and not exists (
     select 1 from entrada_factura f
      where f.entrada_id = c.entrada_id and f.folio = c.factura
   );

insert into entrada_pago (entrada_id, org_id, fecha, monto, observaciones)
select c.entrada_id, c.org_id, current_date, c.importe_pagado,
       'Saldo inicial capturado antes del detalle de pagos'
  from entrada_costo c
 where coalesce(c.importe_pagado, 0) > 0
   and not exists (select 1 from entrada_pago p where p.entrada_id = c.entrada_id);

notify pgrst, 'reload schema';
