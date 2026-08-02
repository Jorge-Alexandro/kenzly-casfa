-- ============================================================================
-- Ventas — Fase 5: inventario como pestaña APARTE, con los movimientos que no
-- son venta (regalía, cortesía, merma, ajuste). La venta YA descuenta stock
-- desde 0018 (trigger trg_ventas_stock, vía ventas_pedido de la Fase 4) — esto
-- sólo cubre lo que NO pasa por un pedido cobrado.
--
-- tipo:
--   regalia / cortesia — sale del inventario sin cobro; cliente_id opcional
--                         (para saber a quién se le dio, si se sabe).
--   merma               — se perdió/dañó; nunca lleva cliente.
--   ajuste_mas / ajuste_menos — corrección manual del conteo físico.
--   entrada             — alta de inventario que no vino de producción/maquila
--                          (ej. arranque inicial de existencias).
--
-- Ejecutar después de 0053.
-- ============================================================================

create table if not exists ventas_movimiento (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  producto_id    uuid not null references ventas_producto(id) on delete restrict,
  tipo           text not null check (tipo in ('regalia', 'cortesia', 'merma', 'ajuste_mas', 'ajuste_menos', 'entrada')),
  cantidad       numeric(14,3) not null check (cantidad > 0),
  cliente_id     uuid references ventas_cliente(id) on delete set null,
  fecha          date not null default current_date,
  motivo         text,
  registrado_por uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists ventas_movimiento_org_fecha_idx on ventas_movimiento (org_id, fecha desc);
create index if not exists ventas_movimiento_producto_idx on ventas_movimiento (producto_id);
alter table ventas_movimiento enable row level security;
drop policy if exists org_isolation on ventas_movimiento;
create policy org_isolation on ventas_movimiento
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ventas_movimiento to authenticated;

-- ----------------------------------------------------------------------------
-- Afecta ventas_stock igual que el trigger de venta (0018): entrada/ajuste_mas
-- SUMAN, el resto RESTA. Al borrar el movimiento se revierte.
-- ----------------------------------------------------------------------------
create or replace function ventas_movimiento_signo(p_tipo text) returns int as $$
begin
  return case when p_tipo in ('entrada', 'ajuste_mas') then 1 else -1 end;
end $$ language plpgsql immutable;

create or replace function ventas_movimiento_stock() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into ventas_stock (org_id, producto_id, cantidad_disponible)
      values (new.org_id, new.producto_id, ventas_movimiento_signo(new.tipo) * new.cantidad)
      on conflict (producto_id) do update
        set cantidad_disponible = ventas_stock.cantidad_disponible + ventas_movimiento_signo(new.tipo) * new.cantidad,
            updated_at = now();
    return new;
  elsif tg_op = 'DELETE' then
    update ventas_stock
       set cantidad_disponible = cantidad_disponible - ventas_movimiento_signo(old.tipo) * old.cantidad,
           updated_at = now()
     where producto_id = old.producto_id;
    return old;
  end if;
  return coalesce(new, old);
end $$ language plpgsql;

drop trigger if exists trg_ventas_movimiento_stock on ventas_movimiento;
create trigger trg_ventas_movimiento_stock after insert or delete on ventas_movimiento
  for each row execute function ventas_movimiento_stock();

notify pgrst, 'reload schema';
