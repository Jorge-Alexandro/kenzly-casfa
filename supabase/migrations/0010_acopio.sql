-- ============================================================================
-- Kenzly CASFA — Módulo 4: Acopio (entradas + pesadas)
-- ----------------------------------------------------------------------------
-- Digitaliza la recepción de café/cacao que hoy vive en AppSheet ("Cspa Acopio")
-- y en CASFA.xlsx (311 entradas, 932 pesadas). Reusa la fundación multi-tenant
-- (org_id + es_miembro), el padrón de productores/parcelas y el patrón de RLS
-- del resto de módulos. NO reimplementa tenancy ni padrón: los referencia.
--
-- Espinazo:  entrada (1) ──< pesada (N)
--   - La entrada es la entrega de un proveedor en una fecha. Guarda calidad,
--     firmas, fotos, comentarios y los TOTALES cacheados.
--   - Cada pesada es un lote parcial (2 máquinas). Guarda sacos/kgs por máquina
--     y costales por material; sus columnas derivadas (tara, netos, quintales)
--     las calcula la app con lib/acopio/calculo.mjs (autoridad para captura
--     offline). El TOTAL de la entrada lo recalcula un trigger por pura suma.
--
-- Config como DATOS, no en código (igual que el motor de fichas):
--   - acopio_producto: combos especie→tipo válidos + factor de quintal + muestra
--   - acopio_tara:     kg de tara por unidad de cada material de costal
--
-- Folio: consecutivo GLOBAL por organización → unique(org_id, folio).
-- Ejecutar después de 0009.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type estado_entrada as enum (
    'borrador','en_pesaje','pendiente_calidad','lista_para_firma',
    'completada','pdf_generado','cancelada'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Catálogo de productos (especie → tipo). Fold de §5 (combos válidos),
-- §7 (factor de quintal) y §13 (tamaño de muestra de la boleta) en una tabla.
-- factor_quintal null  = no aplica quintal (cacao) → la entrada muestra N/A.
-- ----------------------------------------------------------------------------
create table if not exists acopio_producto (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  especie        text not null,                 -- ARABE | ROBUSTA | CACAO
  tipo           text not null,                 -- PERGAMINO | ORO | CEREZO | FERMENTADO | LAVADO
  factor_quintal numeric(8,3),                  -- kg por quintal; null = no aplica
  muestra_g      int,                           -- gramos de muestra para la boleta
  activo         boolean not null default true,
  unique (org_id, especie, tipo)
);
alter table acopio_producto enable row level security;
drop policy if exists org_isolation on acopio_producto;
create policy org_isolation on acopio_producto
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on acopio_producto to authenticated;

-- ----------------------------------------------------------------------------
-- Catálogo de tara por material de costal (§6.4–6.6).
-- ----------------------------------------------------------------------------
create table if not exists acopio_tara (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  material       text not null,                 -- plastico | yute | henequen
  kg_por_unidad  numeric(6,3) not null,
  unique (org_id, material)
);
alter table acopio_tara enable row level security;
drop policy if exists org_isolation on acopio_tara;
create policy org_isolation on acopio_tara
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on acopio_tara to authenticated;

-- ----------------------------------------------------------------------------
-- Contador de folio por organización (secuencia transaccional, no MAX+1 suelto).
-- El trigger de entrada bloquea la fila de su org y toma el siguiente folio.
-- ----------------------------------------------------------------------------
create table if not exists acopio_contador (
  org_id       uuid primary key references organizaciones(id) on delete cascade,
  ultimo_folio int not null default 0
);
alter table acopio_contador enable row level security;
drop policy if exists org_isolation on acopio_contador;
create policy org_isolation on acopio_contador
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on acopio_contador to authenticated;

-- ----------------------------------------------------------------------------
-- Entradas
-- ----------------------------------------------------------------------------
create table if not exists entradas (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  folio         int not null,                   -- consecutivo visible por org
  fecha_acopio  date not null default current_date,

  -- Proveedor: FK al padrón (opcional; hay proveedores históricos aún no dados
  -- de alta) + snapshot de texto para que el recibo no cambie si el padrón se
  -- edita después.
  productor_id      uuid references productores(id) on delete set null,
  proveedor_nombre  text not null,
  comunidad         text,
  municipio         text,

  -- Producto (validado contra acopio_producto por trigger de pesada/entrada)
  especie       text not null,
  tipo          text not null,

  -- Calidad (se captura UNA vez por entrada; NO se suma por pesada, §9/§11).
  -- Fracciones decimales 0..1 (80.13% => 0.8013). null = no capturado.
  rendimiento   numeric(6,4),
  zaranda_16    numeric(6,4),
  zaranda_15    numeric(6,4),
  caracol       numeric(6,4),
  mancha        numeric(6,4),
  humedad       numeric(6,4),
  cosecha       text,                            -- temporada, p.ej. "Temp 2025-2026"

  -- Totales cacheados = suma de pesadas (los mantiene un trigger).
  total_sacos   int     not null default 0,
  kg_brutos     numeric(14,2) not null default 0,
  tara_kg       numeric(14,2) not null default 0,
  kg_netos      numeric(14,2) not null default 0,
  quintales     numeric(14,2),                   -- null cuando el tipo no aplica
  plastico      int not null default 0,
  yute          int not null default 0,
  henequen      int not null default 0,

  comentarios   text,
  elaborado_por uuid references usuarios(id) on delete set null,
  lat           numeric(10,6),
  lng           numeric(10,6),

  -- Evidencias/firmas (rutas en Storage, no binarios; §14).
  firma_proveedor_url  text,
  firma_receptor_url   text,
  foto_calidad_url     text,
  foto_muestra_url     text,
  foto_libreta_url     text,
  foto_libreta2_url    text,

  estado        estado_entrada not null default 'borrador',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, folio)
);
create index if not exists entradas_org_fecha_idx on entradas (org_id, fecha_acopio desc);
create index if not exists entradas_productor_idx  on entradas (productor_id);

alter table entradas enable row level security;
drop policy if exists org_isolation on entradas;
create policy org_isolation on entradas
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on entradas to authenticated;

-- Asignación transaccional del folio por org al insertar.
create or replace function acopio_asignar_folio() returns trigger as $$
declare v_folio int;
begin
  if new.folio is not null and new.folio > 0 then
    return new;                                  -- respeta folio explícito (migración)
  end if;
  insert into acopio_contador (org_id, ultimo_folio) values (new.org_id, 0)
    on conflict (org_id) do nothing;
  update acopio_contador
     set ultimo_folio = ultimo_folio + 1
   where org_id = new.org_id
  returning ultimo_folio into v_folio;
  new.folio := v_folio;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_entrada_folio on entradas;
create trigger trg_entrada_folio before insert on entradas
  for each row execute function acopio_asignar_folio();

-- ----------------------------------------------------------------------------
-- Pesadas
-- ----------------------------------------------------------------------------
create table if not exists pesadas (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  entrada_id     uuid not null references entradas(id) on delete cascade,
  numero_pesada  int not null,                   -- consecutivo dentro de la entrada

  -- Captura por máquina
  m1_sacos       int not null default 0,
  m1_kgs         numeric(12,2) not null default 0,
  m2_sacos       int not null default 0,
  m2_kgs         numeric(12,2) not null default 0,

  -- Costales por material (totales de la pesada; el desglose por máquina se
  -- puede añadir después si CASFA lo pide — hoy CASFA.xlsx sólo guarda el total)
  plastico       int not null default 0,
  yute           int not null default 0,
  henequen       int not null default 0,

  -- Derivadas (las escribe la app con calculo.mjs; guardas para no recalcular
  -- en cada lectura y para que el recibo sea inmutable).
  sacos_total    int not null default 0,
  kg_brutos      numeric(12,2) not null default 0,
  tara_kg        numeric(12,2) not null default 0,
  kg_netos       numeric(12,2) not null default 0,
  quintales      numeric(12,2),                  -- null cuando el tipo no aplica

  foto_url       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (entrada_id, numero_pesada),
  check (tara_kg <= kg_brutos),
  check (kg_netos >= 0)
);
create index if not exists pesadas_entrada_idx on pesadas (entrada_id, numero_pesada);

alter table pesadas enable row level security;
drop policy if exists org_isolation on pesadas;
create policy org_isolation on pesadas
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on pesadas to authenticated;

-- Auto-asigna numero_pesada = max(entrada)+1 si viene nulo (robusto para
-- replays de sincronización offline). §8.2
create or replace function acopio_asignar_numero_pesada() returns trigger as $$
begin
  if new.numero_pesada is null or new.numero_pesada = 0 then
    select coalesce(max(numero_pesada), 0) + 1 into new.numero_pesada
      from pesadas where entrada_id = new.entrada_id;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_pesada_numero on pesadas;
create trigger trg_pesada_numero before insert on pesadas
  for each row execute function acopio_asignar_numero_pesada();

-- ----------------------------------------------------------------------------
-- Recalcular los totales de la entrada = SUMA de sus pesadas (§9).
-- Pura agregación → correcta aunque las pesadas se sincronicen desordenadas.
-- quintales suma sólo si hay valores (tipos que aplican); si ninguna pesada
-- tiene quintal (cacao) queda null = N/A.
-- ----------------------------------------------------------------------------
create or replace function acopio_recalc_entrada(p_entrada uuid) returns void as $$
begin
  update entradas e set
    total_sacos = coalesce(s.total_sacos, 0),
    kg_brutos   = coalesce(s.kg_brutos, 0),
    tara_kg     = coalesce(s.tara_kg, 0),
    kg_netos    = coalesce(s.kg_netos, 0),
    quintales   = s.quintales,
    plastico    = coalesce(s.plastico, 0),
    yute        = coalesce(s.yute, 0),
    henequen    = coalesce(s.henequen, 0),
    updated_at  = now()
  from (
    select
      sum(sacos_total)                      as total_sacos,
      sum(kg_brutos)                        as kg_brutos,
      sum(tara_kg)                          as tara_kg,
      sum(kg_netos)                         as kg_netos,
      sum(quintales) filter (where quintales is not null) as quintales,
      sum(plastico)                         as plastico,
      sum(yute)                             as yute,
      sum(henequen)                         as henequen
    from pesadas where entrada_id = p_entrada
  ) s
  where e.id = p_entrada;
end $$ language plpgsql;

create or replace function acopio_pesada_touch() returns trigger as $$
begin
  perform acopio_recalc_entrada(coalesce(new.entrada_id, old.entrada_id));
  return null;
end $$ language plpgsql;

drop trigger if exists trg_pesada_recalc on pesadas;
create trigger trg_pesada_recalc after insert or update or delete on pesadas
  for each row execute function acopio_pesada_touch();

-- ----------------------------------------------------------------------------
-- Semilla de catálogos para CASFA (idempotente). Otras orgs configuran los
-- suyos igual que configuran sus fichas.
-- ----------------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  select id into v_org from organizaciones where slug = 'casfa';
  if v_org is null then
    raise notice 'org casfa no encontrada; omito semilla de acopio';
    return;
  end if;

  insert into acopio_tara (org_id, material, kg_por_unidad) values
    (v_org, 'plastico', 0.30),
    (v_org, 'yute',     1.00),
    (v_org, 'henequen', 1.30)
  on conflict (org_id, material) do update set kg_por_unidad = excluded.kg_por_unidad;

  insert into acopio_producto (org_id, especie, tipo, factor_quintal, muestra_g) values
    (v_org, 'ARABE',   'PERGAMINO', 57.50, 300),
    (v_org, 'ARABE',   'ORO',       45.35, 350),
    (v_org, 'ROBUSTA', 'CEREZO',    80.00, 300),
    (v_org, 'ROBUSTA', 'ORO',       45.35, 350),
    (v_org, 'CACAO',   'FERMENTADO', null, null),
    (v_org, 'CACAO',   'LAVADO',     null, null)
  on conflict (org_id, especie, tipo)
    do update set factor_quintal = excluded.factor_quintal,
                  muestra_g      = excluded.muestra_g;
end $$;
