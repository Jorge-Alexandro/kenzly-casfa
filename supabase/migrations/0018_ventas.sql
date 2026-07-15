-- ============================================================================
-- Kenzly CASFA — Módulo 5: Ventas (Automatizador de Reportes Mensuales)
-- ----------------------------------------------------------------------------
-- Digitaliza el "Reporte de Ventas Producto Terminado" que hoy vive en Excel
-- (Reporte de ventas 2026 - ENE ABR.xlsx: matriz producto × mes con
-- Cantidad/Importe + KG materia prima + resumen por línea).
--
-- Dos orígenes de venta:
--   - 'cfdi'   → importación de facturas XML del SAT (CFDI 4.0), parseadas en
--                el navegador; el XML original se archiva en Storage (cfdi-xml).
--   - 'manual' → captura directa; descuenta inventario (ventas_stock) por
--                trigger — autoridad en BD, no en el cliente.
--
-- Espinazo:  ventas_factura (1) ──< ventas_detalle (N)
--   ventas_detalle.factura_id es NULL en ventas manuales sin factura.
--
-- Reusa la fundación multi-tenant (org_id + es_miembro) y el patrón RLS
-- org_isolation del resto de módulos. La clasificación de conceptos CFDI en
-- líneas de negocio vive en código (src/lib/ventas/cfdi.mjs), no en tablas:
-- son reglas de texto con orden de prioridad, no configuración por org (aún).
--
-- Ejecutar después de 0017.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Clientes (compradores; distinto del padrón de productores/proveedores).
-- El RFC identifica al cliente dentro de la org; el importador CFDI hace
-- upsert por (org_id, rfc).
-- ----------------------------------------------------------------------------
create table if not exists ventas_cliente (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  rfc            text not null,
  nombre         text not null,
  regimen_fiscal text,
  created_at     timestamptz not null default now(),
  unique (org_id, rfc)
);
alter table ventas_cliente enable row level security;
drop policy if exists org_isolation on ventas_cliente;
create policy org_isolation on ventas_cliente
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ventas_cliente to authenticated;

-- ----------------------------------------------------------------------------
-- Productos terminados (catálogo de venta; NO confundir con acopio_producto,
-- que es materia prima). linea = línea de negocio (Café Tostado, Café Verde,
-- Miel, ...). El importador CFDI da de alta productos nuevos por descripción.
-- ----------------------------------------------------------------------------
create table if not exists ventas_producto (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizaciones(id) on delete cascade,
  nombre     text not null,
  linea      text not null default 'Otros',
  unidad     text not null default 'KG',
  -- Peso en kg de UNA unidad vendida (bolsa 340g → 0.34; a granel KG → 1).
  -- Alimenta los KG procesados del reporte y la gráfica valor vs volumen.
  kg_por_unidad numeric(10,4) not null default 1,
  clave_sat  text,                               -- ClaveProdServ del SAT
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, nombre)
);
alter table ventas_producto enable row level security;
drop policy if exists org_isolation on ventas_producto;
create policy org_isolation on ventas_producto
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ventas_producto to authenticated;

-- ----------------------------------------------------------------------------
-- Precio acordado por cliente+producto con vigencia. La captura manual
-- pre-carga el vigente más reciente; si el precio capturado se desvía más de
-- tolerancia_pct se marca alerta_precio en el detalle (no bloquea).
-- ----------------------------------------------------------------------------
create table if not exists ventas_precio_cliente (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizaciones(id) on delete cascade,
  cliente_id      uuid not null references ventas_cliente(id) on delete cascade,
  producto_id     uuid not null references ventas_producto(id) on delete cascade,
  precio_acordado numeric(14,2) not null,
  tolerancia_pct  numeric(5,4) not null default 0.05,
  vigente_desde   date not null default current_date,
  created_at      timestamptz not null default now(),
  unique (cliente_id, producto_id, vigente_desde)
);
create index if not exists ventas_precio_lookup_idx
  on ventas_precio_cliente (cliente_id, producto_id, vigente_desde desc);
alter table ventas_precio_cliente enable row level security;
drop policy if exists org_isolation on ventas_precio_cliente;
create policy org_isolation on ventas_precio_cliente
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ventas_precio_cliente to authenticated;

-- ----------------------------------------------------------------------------
-- Facturas (una por CFDI importado). folio_fiscal = UUID del timbre fiscal
-- (Complemento/TimbreFiscalDigital) → único por org: re-importar el mismo XML
-- no duplica. xml_url apunta al bucket privado cfdi-xml.
-- ----------------------------------------------------------------------------
create table if not exists ventas_factura (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  folio_fiscal  text not null,
  folio_interno text,                            -- Comprobante@Folio (ej. 4138)
  cliente_id    uuid not null references ventas_cliente(id) on delete restrict,
  fecha         date not null,
  total         numeric(14,2) not null,
  xml_url       text,
  estado        text not null default 'vigente', -- vigente | cancelada
  created_at    timestamptz not null default now(),
  unique (org_id, folio_fiscal)
);
create index if not exists ventas_factura_fecha_idx on ventas_factura (org_id, fecha desc);
alter table ventas_factura enable row level security;
drop policy if exists org_isolation on ventas_factura;
create policy org_isolation on ventas_factura
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ventas_factura to authenticated;

-- ----------------------------------------------------------------------------
-- Detalle de venta (la fila que alimenta todo el reporteo). Una por concepto
-- CFDI o por captura manual. importe = cantidad × precio_unitario (el servidor
-- lo recalcula; no se confía en el cliente).
-- ----------------------------------------------------------------------------
create table if not exists ventas_detalle (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizaciones(id) on delete cascade,
  factura_id      uuid references ventas_factura(id) on delete cascade,
  producto_id     uuid not null references ventas_producto(id) on delete restrict,
  cliente_id      uuid not null references ventas_cliente(id) on delete restrict,
  cantidad        numeric(14,3) not null,
  precio_unitario numeric(14,2) not null,
  importe         numeric(14,2) not null,
  fecha           date not null,
  alerta_precio   boolean not null default false,
  origen          text not null check (origen in ('cfdi', 'manual')),
  created_at      timestamptz not null default now(),
  check (cantidad > 0)
);
create index if not exists ventas_detalle_org_fecha_idx on ventas_detalle (org_id, fecha desc);
create index if not exists ventas_detalle_factura_idx  on ventas_detalle (factura_id);
create index if not exists ventas_detalle_producto_idx on ventas_detalle (producto_id);
alter table ventas_detalle enable row level security;
drop policy if exists org_isolation on ventas_detalle;
create policy org_isolation on ventas_detalle
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ventas_detalle to authenticated;

-- ----------------------------------------------------------------------------
-- Inventario de producto terminado. Una fila por producto.
-- ----------------------------------------------------------------------------
create table if not exists ventas_stock (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizaciones(id) on delete cascade,
  producto_id         uuid not null references ventas_producto(id) on delete cascade,
  cantidad_disponible numeric(14,3) not null default 0,
  unidad              text not null default 'KG',
  updated_at          timestamptz not null default now(),
  unique (producto_id)
);
alter table ventas_stock enable row level security;
drop policy if exists org_isolation on ventas_stock;
create policy org_isolation on ventas_stock
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on ventas_stock to authenticated;

-- ----------------------------------------------------------------------------
-- Trigger: la venta MANUAL descuenta inventario (y lo repone si se borra).
-- Las ventas 'cfdi' NO tocan stock: son importación histórica de facturas y
-- pueden corresponder a ventas ya capturadas a mano — descontar ambas
-- duplicaría la salida. Puede quedar negativo a propósito: es señal visible
-- de inventario mal inicializado, no un error a ocultar.
-- ----------------------------------------------------------------------------
create or replace function ventas_stock_descontar() returns trigger as $$
begin
  if (tg_op = 'INSERT' and new.origen = 'manual') then
    insert into ventas_stock (org_id, producto_id, cantidad_disponible)
      values (new.org_id, new.producto_id, -new.cantidad)
      on conflict (producto_id) do update
        set cantidad_disponible = ventas_stock.cantidad_disponible - new.cantidad,
            updated_at = now();
    return new;
  elsif (tg_op = 'DELETE' and old.origen = 'manual') then
    update ventas_stock
       set cantidad_disponible = cantidad_disponible + old.cantidad,
           updated_at = now()
     where producto_id = old.producto_id;
    return old;
  end if;
  return coalesce(new, old);
end $$ language plpgsql;

drop trigger if exists trg_ventas_stock on ventas_detalle;
create trigger trg_ventas_stock after insert or delete on ventas_detalle
  for each row execute function ventas_stock_descontar();

-- ----------------------------------------------------------------------------
-- Storage: bucket PRIVADO para los XML CFDI originales (son documentos
-- fiscales — a diferencia de 'geosic', no se exponen con URL pública; el
-- servidor entrega signed URLs). Ruta: {org_id}/{folio_fiscal}.xml
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cfdi-xml', 'cfdi-xml', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'cfdi_xml_read'
  ) then
    create policy cfdi_xml_read on storage.objects
      for select to authenticated using (bucket_id = 'cfdi-xml');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'cfdi_xml_write'
  ) then
    create policy cfdi_xml_write on storage.objects
      for insert to authenticated with check (bucket_id = 'cfdi-xml');
  end if;
end $$;
