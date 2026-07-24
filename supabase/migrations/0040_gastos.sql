-- ============================================================================
-- Kenzly CASFA — Gastos por programa (Emily y Francisco)
-- ----------------------------------------------------------------------------
-- Emily y Francisco llevan a mano el libro "GASTOS CERTIFICACION.xlsx": una
-- matriz por programa donde cada fila es un movimiento con su fecha y cada
-- columna una categoría de gasto (viáticos, gasolina, nómina, copias…), con la
-- columna TOTAL al final.
--
-- Aquí eso se vuelve tres tablas:
--   gasto_programa   — Certificación, Agroecología (cada uno con su catálogo)
--   gasto_categoria  — las columnas de su Excel, por programa
--   gasto            — un movimiento: fecha, categoría, monto, comprobante
--
-- La MATRIZ ya no se captura: se arma sola al leer los movimientos, así que la
-- columna TOTAL y los totales por categoría no pueden descuadrar (en su Excel
-- cuadraban porque los sumaban a mano cada vez).
--
-- Los montos son dinero: la RLS los deja SÓLO a admin/contador (es_contador),
-- igual que el costo de las boletas. El área operativa no ve gastos.
--
-- Ejecutar después de 0039.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Programas
-- ----------------------------------------------------------------------------
create table if not exists gasto_programa (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references organizaciones(id) on delete cascade,
  clave   text not null,
  nombre  text not null,
  orden   int  not null default 0,
  activo  boolean not null default true,
  unique (org_id, clave)
);

-- ----------------------------------------------------------------------------
-- Categorías (las columnas del Excel), por programa
-- ----------------------------------------------------------------------------
create table if not exists gasto_categoria (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizaciones(id) on delete cascade,
  programa_id uuid not null references gasto_programa(id) on delete cascade,
  nombre      text not null,
  orden       int  not null default 0,
  activo      boolean not null default true,
  unique (programa_id, nombre)
);
create index if not exists gasto_categoria_programa_idx on gasto_categoria (programa_id);

-- ----------------------------------------------------------------------------
-- Movimientos
-- ----------------------------------------------------------------------------
create table if not exists gasto (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  programa_id    uuid not null references gasto_programa(id) on delete restrict,
  categoria_id   uuid not null references gasto_categoria(id) on delete restrict,
  fecha          date not null,
  monto          numeric(14,2) not null check (monto >= 0),
  concepto       text,
  beneficiario   text,
  comprobante    text,          -- folio de factura / recibo / vale
  registrado_por uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists gasto_org_fecha_idx on gasto (org_id, fecha);
create index if not exists gasto_programa_idx on gasto (programa_id, fecha);

-- ----------------------------------------------------------------------------
-- RLS — sólo Contabilidad (admin/contador). es_contador() viene de 0036.
-- ----------------------------------------------------------------------------
alter table gasto_programa  enable row level security;
alter table gasto_categoria enable row level security;
alter table gasto           enable row level security;

drop policy if exists solo_contabilidad on gasto_programa;
create policy solo_contabilidad on gasto_programa
  for all using (es_contador(org_id)) with check (es_contador(org_id));

drop policy if exists solo_contabilidad on gasto_categoria;
create policy solo_contabilidad on gasto_categoria
  for all using (es_contador(org_id)) with check (es_contador(org_id));

drop policy if exists solo_contabilidad on gasto;
create policy solo_contabilidad on gasto
  for all using (es_contador(org_id)) with check (es_contador(org_id));

grant select, insert, update, delete on gasto_programa  to authenticated;
grant select, insert, update, delete on gasto_categoria to authenticated;
grant select, insert, update, delete on gasto           to authenticated;

-- ----------------------------------------------------------------------------
-- Catálogo inicial: exactamente las columnas de su Excel.
-- ("VIATICOS INGNACIO" venía con el dedazo; queda como Viáticos Ignacio.)
-- ----------------------------------------------------------------------------
do $$
declare
  o uuid;
  p_cert uuid;
  p_agro uuid;
begin
  select id into o from organizaciones where slug = 'casfa';
  if o is null then
    raise notice 'no existe la organización casfa; se omite el catálogo inicial';
    return;
  end if;

  insert into gasto_programa (org_id, clave, nombre, orden) values
    (o, 'CERTIFICACION', 'Certificación', 1),
    (o, 'AGROECOLOGIA',  'Agroecología',  2)
  on conflict (org_id, clave) do nothing;

  select id into p_cert from gasto_programa where org_id = o and clave = 'CERTIFICACION';
  select id into p_agro from gasto_programa where org_id = o and clave = 'AGROECOLOGIA';

  insert into gasto_categoria (org_id, programa_id, nombre, orden) values
    (o, p_cert, 'Viáticos',            1),
    (o, p_cert, 'Viáticos Ignacio',    2),
    (o, p_cert, 'Pago de fichas',      3),
    (o, p_cert, 'Lavado de camioneta', 4),
    (o, p_cert, 'Gasolina',            5),
    (o, p_cert, 'Hoteles',             6),
    (o, p_cert, 'Nómina',              7),
    (o, p_cert, 'Copias',              8)
  on conflict (programa_id, nombre) do nothing;

  insert into gasto_categoria (org_id, programa_id, nombre, orden) values
    (o, p_agro, 'Comida',           1),
    (o, p_agro, 'Transporte',       2),
    (o, p_agro, 'Renta',            3),
    (o, p_agro, 'Gasolina',         4),
    (o, p_agro, 'Copias',           5),
    (o, p_agro, 'Nómina',           6),
    (o, p_agro, 'Insumos talleres', 7)
  on conflict (programa_id, nombre) do nothing;
end $$;

notify pgrst, 'reload schema';
