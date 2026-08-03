-- ============================================================================
-- Ventas — Requisiciones: la orden interna de producción para torrefacción.
-- Reemplaza el "Formato de Requisicion.xlsx" en papel — el que ya no
-- funcionaba tenía columnas de "costo unitario" en kg de café verde por
-- especie, confusas y sin usar. Lo que de verdad importa (según CASFA) es
-- que a torrefacción le llegue claro CUÁNTO hay que producir — por eso el
-- rediseño es sólo: producto, cantidad y su kilaje equivalente
-- (ventas_producto.kg_por_unidad, ya validado en la Fase 3 contra la Tabla
-- de Equivalencias real). NO descuenta inventario — es papeleo/trazabilidad,
-- el stock ya lo gobiernan la venta capturada (Fase 4) y los movimientos
-- (Fase 5). Folio consecutivo por organización, mismo patrón que asistencia
-- (0044): tabla contador + trigger transaccional, no MAX+1 suelto.
--
-- Ejecutar después de 0055.
-- ============================================================================

create table if not exists ventas_requisicion_contador (
  org_id       uuid primary key references organizaciones(id) on delete cascade,
  ultimo_folio int not null default 0
);
alter table ventas_requisicion_contador enable row level security;
drop policy if exists org_isolation on ventas_requisicion_contador;
create policy org_isolation on ventas_requisicion_contador
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ventas_requisicion_contador to authenticated;

create table if not exists ventas_requisicion (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizaciones(id) on delete cascade,
  folio       int not null,
  fecha       date not null default current_date,
  cliente_id  uuid references ventas_cliente(id) on delete set null,
  pedido_id   uuid references ventas_pedido(id) on delete set null,
  cliente_texto text,               -- si no hay cliente en catálogo (uso interno)
  solicito    text,
  autorizo    text,
  entrego     text default 'Almacén',
  notas       text,
  created_by  uuid references usuarios(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (org_id, folio)
);
create index if not exists ventas_requisicion_org_fecha_idx on ventas_requisicion (org_id, fecha desc);
alter table ventas_requisicion enable row level security;
drop policy if exists org_isolation on ventas_requisicion;
create policy org_isolation on ventas_requisicion
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ventas_requisicion to authenticated;

create table if not exists ventas_requisicion_item (
  id             uuid primary key default gen_random_uuid(),
  requisicion_id uuid not null references ventas_requisicion(id) on delete cascade,
  org_id         uuid not null references organizaciones(id) on delete cascade,
  producto_id    uuid not null references ventas_producto(id) on delete restrict,
  cantidad       numeric(14,3) not null check (cantidad > 0),
  created_at     timestamptz not null default now()
);
create index if not exists ventas_requisicion_item_req_idx on ventas_requisicion_item (requisicion_id);
alter table ventas_requisicion_item enable row level security;
drop policy if exists org_isolation on ventas_requisicion_item;
create policy org_isolation on ventas_requisicion_item
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ventas_requisicion_item to authenticated;

-- Folio consecutivo por organización — mismo patrón que asistencia_lista.
create or replace function ventas_requisicion_asignar_folio() returns trigger as $$
declare v_folio int;
begin
  if new.folio is not null and new.folio > 0 then
    return new;
  end if;
  insert into ventas_requisicion_contador (org_id, ultimo_folio) values (new.org_id, 0)
    on conflict (org_id) do nothing;
  update ventas_requisicion_contador
     set ultimo_folio = ultimo_folio + 1
   where org_id = new.org_id
  returning ultimo_folio into v_folio;
  new.folio := v_folio;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_ventas_requisicion_folio on ventas_requisicion;
create trigger trg_ventas_requisicion_folio before insert on ventas_requisicion
  for each row execute function ventas_requisicion_asignar_folio();

notify pgrst, 'reload schema';
