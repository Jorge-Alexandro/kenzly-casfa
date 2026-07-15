-- ============================================================================
-- Kenzly CASFA — Módulo 6: Maquila (beneficiado) e Inventario de bodega
-- ----------------------------------------------------------------------------
-- Digitaliza los formatos que el encargado del acopio entrega hoy en Excel:
--
--   1. FORMATO MAQUILA N        → un corte de beneficiado: entra café pergamino
--                                 (o cerezo/oro), sale clasificado en productos
--                                 (Oro Exportación, Caracol, Desmanches, Granza…)
--                                 agrupados en Primeras / Segundas / Terceras.
--   2. FORMATO DE REPASO        → el mismo corte, sin boletas ni lotes.
--   3. INVENTARIO DE MATERIA    → kardex de bodega a una fecha (entradas,
--      PRIMA / PROD. TERMINADOS   salidas, stock por producto y especie).
--   4. 2026 MASTER MAQUILA      → consolidado que HOY se llena copiando a mano
--                                 cada formato. Aquí deja de existir: es la
--                                 vista v_maquila_master.
--
-- El engrane con lo que ya existe:
--   entradas.folio  ES  el "BOLETA" de la hoja BOLETAS del formato de maquila.
--   Por eso maquila_boleta referencia entradas(id) y además guarda un SNAPSHOT
--   (proveedor, sacos, kilos) — los formatos históricos citan boletas que
--   pueden no estar capturadas en el módulo de acopio, y el corte no debe
--   romperse por eso. entrada_id null = boleta histórica sin match.
--
--   acopio_producto.factor_quintal (57.5 pergamino, 45.35 oro, 80 cerezo) es la
--   MISMA autoridad que usa el MASTER para convertir kg → QQ. No se duplica.
--
-- Cadena completa del grano:
--   entradas (acopio) → maquila (beneficiado) → maquila_resultado (producto oro)
--     → maquila_lote (lotes de 275 s/c) → maquila_salida (embarque a Laredo)
--   con inventario_corte como foto de bodega en cualquier fecha.
--
-- Ejecutar después de 0022.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type tipo_proceso_maquila as enum (
    'maquila',              -- corte normal: entra pergamino/cerezo
    'repaso_oro',           -- se vuelve a pasar café oro por el beneficio
    'repaso_clasificadora'  -- repaso corto, sin boletas ni lotes
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type grupo_calidad as enum ('primeras','segundas','terceras','merma');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Catálogo de productos de SALIDA del beneficio.
--
-- Config como datos, igual que acopio_producto. Existe porque el encargado
-- escribe el mismo producto de tres formas distintas según la hoja:
--   formato maquila →  'DESMACHE OLIVER'          (con la errata de siempre)
--   inventario      →  'ORO SEGUNDA (OLIVER)'
--   prod. terminado →  'OLIVER' con código P05
-- `alias` normaliza las tres a una sola clave. Añadir una variante nueva es un
-- insert, no un deploy.
-- ----------------------------------------------------------------------------
create table if not exists maquila_producto (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizaciones(id) on delete cascade,
  clave       text not null,                  -- ORO_EXPORTACION, OLIVER, ...
  nombre      text not null,                  -- como se imprime en el formato
  grupo       grupo_calidad not null,
  codigo_pt   text,                           -- P01..P09 del inventario de PT
  kg_por_saco numeric(6,2) not null default 69,
  orden       int not null default 0,         -- orden de impresión en el corte
  alias       text[] not null default '{}',   -- variantes de escritura, ya normalizadas
  activo      boolean not null default true,
  unique (org_id, clave)
);
create index if not exists maquila_producto_alias_idx on maquila_producto using gin (alias);

alter table maquila_producto enable row level security;
drop policy if exists org_isolation on maquila_producto;
create policy org_isolation on maquila_producto
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on maquila_producto to authenticated;

-- ----------------------------------------------------------------------------
-- Cortes de maquila (cabecera del formato).
--
-- `clave` es el identificador humano del corte: 'M-19' o 'RC-2026-05-30'.
-- Los repasos de clasificadora no traen número, por eso `numero` es nullable y
-- la unicidad cuelga de la clave.
--
-- Los totales (qq_entrada, rendimiento, sacos_total) NO se confían al Excel:
-- los recalcula el trigger desde maquila_resultado. El Excel se guarda tal cual
-- en `origen_archivo` para poder auditar el descuadre en vez de esconderlo.
-- ----------------------------------------------------------------------------
create table if not exists maquilas (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  clave         text not null,                 -- 'M-19', 'RC-2026-05-30'
  numero        int,                           -- 19  (null en repaso de clasificadora)
  tipo_proceso  tipo_proceso_maquila not null default 'maquila',
  fecha_corte   date not null,
  fecha_envio   date,

  -- Materia prima que ENTRA al proceso. especie/tipo validan contra
  -- acopio_producto (mismo catálogo que el acopio) → de ahí sale el factor.
  especie       text not null,                 -- ARABE | ROBUSTA
  tipo_entrada  text not null,                 -- PERGAMINO | ORO | CEREZO
  descripcion   text,                          -- 'ARABE MIX PERGAMINO - ORO', libre

  sacos_entrada  int           not null default 0,
  kg_entrada     numeric(14,2) not null default 0,
  factor_quintal numeric(8,3),                 -- snapshot: 57.5 / 45.35 / 80
  qq_entrada     numeric(14,4),                -- kg_entrada / factor_quintal
  estimado_sacos numeric(12,2),                -- 'ESTIMADO A OBTENER' del formato

  -- Cacheados por trigger desde maquila_resultado (suma pura).
  kg_salida     numeric(14,2) not null default 0,
  qq_salida     numeric(14,4) not null default 0,
  sacos_salida  int           not null default 0,
  rendimiento   numeric(8,6),                  -- kg_salida / kg_entrada

  -- Cuadre de sacos de ORO EXPORTACIÓN (el bloque del pie del formato).
  -- Identidad que debe cumplirse y que hoy nadie verifica:
  --   producidos + anteriores − enviados_lotes − torrefaccion − venta − otro_lote
  --     = no_enviados
  sacos_enviados_lotes    int not null default 0,
  sacos_maquilas_previas  int not null default 0,   -- arrastre del inventario
  sacos_torrefaccion      int not null default 0,
  sacos_no_enviados       int not null default 0,
  sacos_venta             int not null default 0,
  sacos_otro_lote         int not null default 0,
  sacos_repaso            int not null default 0,
  sacos_cuadre_total      int not null default 0,   -- 'TOTAL DE SACOS' del Excel

  observaciones text,
  elaboro       text,
  entrego       text,
  retrillero    text,
  calador       text,

  -- Trazabilidad de la ingesta: qué archivo lo produjo y si cuadró.
  origen_archivo text,
  origen_hash    text,                          -- sha-256 del xlsx → idempotencia
  avisos         jsonb not null default '[]',   -- descuadres detectados al importar

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, clave)
);
create index if not exists maquilas_org_fecha_idx on maquilas (org_id, fecha_corte desc);
create unique index if not exists maquilas_hash_idx on maquilas (org_id, origen_hash)
  where origen_hash is not null;

alter table maquilas enable row level security;
drop policy if exists org_isolation on maquilas;
create policy org_isolation on maquilas
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on maquilas to authenticated;

-- ----------------------------------------------------------------------------
-- Boletas que alimentaron el corte (hoja BOLETAS del formato).
-- Es el puente con el módulo de acopio: folio → entradas.folio.
-- ----------------------------------------------------------------------------
create table if not exists maquila_boleta (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizaciones(id) on delete cascade,
  maquila_id  uuid not null references maquilas(id) on delete cascade,

  folio       int not null,                                   -- 'BOLETA' del Excel
  entrada_id  uuid references entradas(id) on delete set null, -- null = histórica

  -- Snapshot: el corte es un documento, no debe cambiar si el padrón se edita.
  proveedor_nombre text not null,
  tipo_cafe        text,                        -- 'ARABE PERGAMINO', 'ORO ARABE'
  sacos       int           not null default 0,
  kg_brutos   numeric(12,2) not null default 0,
  tara_kg     numeric(12,2) not null default 0,
  kg_netos    numeric(12,2) not null default 0,
  quintales   numeric(12,4),

  unique (maquila_id, folio)
);
create index if not exists maquila_boleta_entrada_idx on maquila_boleta (entrada_id);

alter table maquila_boleta enable row level security;
drop policy if exists org_isolation on maquila_boleta;
create policy org_isolation on maquila_boleta
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on maquila_boleta to authenticated;

-- ----------------------------------------------------------------------------
-- Resultado del corte: un renglón por producto (el bloque 'RESULTADO:').
--
-- El formato guarda sacos COMPLETOS + kilos SUELTOS por separado:
--   total_kg = sacos * kg_por_saco + kilos_sueltos
-- Se conserva el desglose porque en bodega se cuentan sacos, no kilos.
-- ----------------------------------------------------------------------------
create table if not exists maquila_resultado (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  maquila_id    uuid not null references maquilas(id) on delete cascade,
  producto_id   uuid not null references maquila_producto(id),

  sacos         int           not null default 0,
  kilos_sueltos numeric(12,2) not null default 0,
  kg_por_saco   numeric(6,2)  not null default 69,
  total_kg      numeric(14,2) not null default 0,
  quintales     numeric(14,4) not null default 0,
  rend_real     numeric(8,6),                  -- % sobre el total de oro obtenido

  unique (maquila_id, producto_id)
);
create index if not exists maquila_resultado_maquila_idx on maquila_resultado (maquila_id);

alter table maquila_resultado enable row level security;
drop policy if exists org_isolation on maquila_resultado;
create policy org_isolation on maquila_resultado
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on maquila_resultado to authenticated;

-- ----------------------------------------------------------------------------
-- Lotes de salida del corte (bloque 'SALIDAS:'): 275 sacos de 70 kg c/u.
-- OJO: el saco de LOTE es de 70 kg; el saco de RESULTADO es de 69 kg. No son
-- la misma unidad y por eso el cuadre se hace en kilos, nunca en sacos.
-- ----------------------------------------------------------------------------
create table if not exists maquila_lote (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizaciones(id) on delete cascade,
  maquila_id  uuid not null references maquilas(id) on delete cascade,
  numero_lote int not null,
  sacos       int           not null default 0,
  kg          numeric(12,2) not null default 0,
  descripcion text,
  unique (org_id, numero_lote)
);
alter table maquila_lote enable row level security;
drop policy if exists org_isolation on maquila_lote;
create policy org_isolation on maquila_lote
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on maquila_lote to authenticated;

-- ----------------------------------------------------------------------------
-- Embarques (hoja SALIDA del MASTER): la programación de entregas.
-- ----------------------------------------------------------------------------
create table if not exists maquila_salida (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  fecha_salida  date not null,
  maquila_id    uuid references maquilas(id) on delete set null,
  lote_id       uuid references maquila_lote(id) on delete set null,

  especie       text,                          -- ARABE | ROBUSTA
  clasificacion text,                          -- EXP, PL, ...
  guia          text,                          -- '26/CAS-01'
  numero_lote   int,
  destino       text,                          -- 'LAREDO TX'
  sacos         int           not null default 0,
  qq_unitario   numeric(12,4),
  quintales     numeric(14,4),
  lote_oic      text,                          -- '16-2026-0001'
  transporte    text,
  placas        text,
  observacion   text,                          -- 'EMBARCADO'
  created_at    timestamptz not null default now(),
  unique (org_id, guia)
);
create index if not exists maquila_salida_fecha_idx on maquila_salida (org_id, fecha_salida desc);

alter table maquila_salida enable row level security;
drop policy if exists org_isolation on maquila_salida;
create policy org_isolation on maquila_salida
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on maquila_salida to authenticated;

-- ----------------------------------------------------------------------------
-- Inventario de bodega: una foto (corte) con N renglones.
-- ----------------------------------------------------------------------------
create table if not exists inventario_corte (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizaciones(id) on delete cascade,
  fecha        date not null,
  notas        text,
  origen_archivo text,
  origen_hash    text,
  created_at   timestamptz not null default now(),
  unique (org_id, fecha)
);
alter table inventario_corte enable row level security;
drop policy if exists org_isolation on inventario_corte;
create policy org_isolation on inventario_corte
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on inventario_corte to authenticated;

create table if not exists inventario_linea (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  corte_id       uuid not null references inventario_corte(id) on delete cascade,

  especie        text not null,                -- CAFE ARABE | CAFE ROBUSTA | CACAO | CAFE
  producto_id    uuid references maquila_producto(id),  -- null si no mapea al catálogo
  producto_texto text not null,                -- como viene en el Excel

  entradas_sacos int           not null default 0,
  entradas_kg    numeric(14,2) not null default 0,
  salidas_sacos  int           not null default 0,
  salidas_kg     numeric(14,2) not null default 0,
  stock_kg       numeric(14,2) not null default 0,
  stock_sacos    int           not null default 0,
  quintales      numeric(14,4),

  unique (corte_id, producto_texto, especie)
);
create index if not exists inventario_linea_corte_idx on inventario_linea (corte_id);

alter table inventario_linea enable row level security;
drop policy if exists org_isolation on inventario_linea;
create policy org_isolation on inventario_linea
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on inventario_linea to authenticated;

-- ----------------------------------------------------------------------------
-- Totales del corte = SUMA de sus resultados. Igual que acopio_recalc_entrada:
-- pura agregación, correcta aunque los renglones lleguen desordenados.
-- Recalcula además el rendimiento y el % de cada producto sobre el oro total.
-- ----------------------------------------------------------------------------
create or replace function maquila_recalc(p_maquila uuid) returns void as $$
declare v_kg numeric;
begin
  select coalesce(sum(total_kg), 0) into v_kg
    from maquila_resultado where maquila_id = p_maquila;

  update maquilas m set
    kg_salida    = coalesce(s.kg, 0),
    qq_salida    = coalesce(s.qq, 0),
    sacos_salida = coalesce(s.sacos, 0),
    rendimiento  = case when m.kg_entrada > 0
                        then coalesce(s.kg, 0) / m.kg_entrada end,
    updated_at   = now()
  from (
    select sum(total_kg) as kg, sum(quintales) as qq, sum(sacos) as sacos
      from maquila_resultado where maquila_id = p_maquila
  ) s
  where m.id = p_maquila;

  -- rend_real de cada producto = su participación en el oro total del corte.
  update maquila_resultado r
     set rend_real = case when v_kg > 0 then r.total_kg / v_kg end
   where r.maquila_id = p_maquila;
end $$ language plpgsql;

create or replace function maquila_resultado_touch() returns trigger as $$
begin
  perform maquila_recalc(coalesce(new.maquila_id, old.maquila_id));
  return null;
end $$ language plpgsql;

drop trigger if exists trg_maquila_resultado_recalc on maquila_resultado;
create trigger trg_maquila_resultado_recalc
  after insert or update or delete on maquila_resultado
  for each row execute function maquila_resultado_touch();

-- ----------------------------------------------------------------------------
-- v_maquila_master — sustituye la hoja 'MASTER MAQUILAS' del Excel.
-- Lo que hoy se teclea a mano por cada corte, aquí se deriva.
-- ----------------------------------------------------------------------------
create or replace view v_maquila_master as
with agrupado as (
  select
    r.maquila_id,
    p.grupo,
    sum(r.sacos)     as sacos,
    sum(r.total_kg)  as kg,
    sum(r.quintales) as qq
  from maquila_resultado r
  join maquila_producto p on p.id = r.producto_id
  group by r.maquila_id, p.grupo
)
select
  m.org_id,
  m.clave,
  m.numero,
  m.tipo_proceso,
  m.fecha_envio,
  m.fecha_corte,
  m.especie,
  m.tipo_entrada,
  m.descripcion,
  m.sacos_entrada,
  m.kg_entrada,
  m.qq_entrada,

  coalesce(pr.sacos, 0)                     as sacos_primeras,
  coalesce(pr.qq, 0)                        as qq_primeras,
  case when m.qq_salida > 0 then coalesce(pr.qq, 0) / m.qq_salida end as rend_primeras,

  coalesce(sg.sacos, 0)                     as sacos_segundas,
  coalesce(sg.qq, 0)                        as qq_segundas,
  case when m.qq_salida > 0 then coalesce(sg.qq, 0) / m.qq_salida end as rend_segundas,

  coalesce(te.sacos, 0)                     as sacos_terceras,
  coalesce(te.qq, 0)                        as qq_terceras,
  case when m.qq_salida > 0 then coalesce(te.qq, 0) / m.qq_salida end as rend_terceras,

  coalesce(sg.qq, 0) + coalesce(te.qq, 0)   as qq_segundas_terceras,
  m.sacos_salida,
  m.qq_salida,
  m.qq_salida - coalesce(m.qq_entrada, 0)   as qq_diferencia,
  m.rendimiento,
  -- Rendimiento del proceso: cuánto oro sale de más (o de menos) contra lo que
  -- entró, en QQ. Positivo = el beneficio rindió por encima de lo estimado.
  case when m.qq_entrada > 0
       then (m.qq_salida - m.qq_entrada) / m.qq_entrada end as rend_proceso
from maquilas m
left join agrupado pr on pr.maquila_id = m.id and pr.grupo = 'primeras'
left join agrupado sg on sg.maquila_id = m.id and sg.grupo = 'segundas'
left join agrupado te on te.maquila_id = m.id and te.grupo = 'terceras';

grant select on v_maquila_master to authenticated;

-- ----------------------------------------------------------------------------
-- Semilla del catálogo de productos para CASFA (idempotente).
-- Los alias salen de leer los 19 formatos + los inventarios: son las formas
-- reales en que están escritos, erratas incluidas ('DESMACHE', 'CERESO').
-- ----------------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  select id into v_org from organizaciones where slug = 'casfa';
  if v_org is null then
    raise notice 'org casfa no encontrada; omito semilla de maquila';
    return;
  end if;

  insert into maquila_producto (org_id, clave, nombre, grupo, codigo_pt, orden, alias) values
    (v_org, 'ORO_EXPORTACION', 'ORO EXPORTACION', 'primeras', null, 10, array[
      'ORO EXPORTACION','ORO EXPORTACION ARABE (PRIMERAS)','ORO EXPORTACION ROBUSTA(PRIMERAS)',
      'ORO EXPORTACION ROBUSTA (PRIMERAS)','EXPORTACION']),
    (v_org, 'CARACOL', 'CARACOL', 'primeras', 'P09', 20, array[
      'CARACOL']),
    (v_org, 'CLASIFICADORA', 'DESMANCHE CLASIFICADORA', 'segundas', 'P03', 30, array[
      'DESMANCHE CLASIFICADORA','DESMACHE CLASIFICADORA','ORO SEGUNDAS (CLASIFICADORA)',
      'ORO SEGUNDA (CLASIFICADORA)','CLASIFICADORA']),
    (v_org, 'OLIVER', 'DESMANCHE OLIVER', 'segundas', 'P05', 40, array[
      'DESMACHE OLIVER','DESMANCHE OLIVER','ORO SEGUNDA (OLIVER)','ORO SEGUNDAS (OLIVER)',
      'OLIVER']),
    (v_org, 'ELECTRONICA', 'DESMANCHE ELECTRONICA', 'segundas', 'P01', 50, array[
      'DESMACHE ELECTRONICA','DESMANCHE ELECTRONICA','ORO SEGUNDAS (ELECTRONICA)',
      'ORO SEGUNDA (ELECTRONICA)','ELECTRONICA']),
    (v_org, 'PL', 'PL', 'segundas', 'P02', 60, array[
      'PL','PL DE CLASIFICADORA','PL DE ELECTRONICA','ORO SEGUNDAS(PL)','ORO SEGUNDAS (PL)']),
    (v_org, 'ORO_NATURAL', 'ORO NATURAL', 'segundas', null, 70, array[
      'ORO NATURAL']),
    (v_org, 'GRANZA', 'GRANZA', 'terceras', null, 80, array[
      'GRANZA','ORO TERCERAS(GRANZA)','ORO TERCERAS (GRANZA)']),
    (v_org, 'CEREZO', 'CERESO', 'terceras', 'P07', 90, array[
      'CERESO','CEREZO','ORO TERCERAS(CEREZO)','ORO TERCERAS (CEREZO)','ORO TERCERAS(CERESO)']),
    (v_org, 'REPASO_CLASIFICADORA', 'REPASO DE CLASIFICADORA', 'terceras', null, 100, array[
      'REPASO DE CLASIFICADORA','ORO TERCERAS(REPASO DE CLASIFICADORA)',
      'ORO TERCERAS (REPASO DE CLASIFICADORA)']),
    (v_org, 'BASURA', 'BASURA', 'merma', null, 110, array[
      'BASURA'])
  on conflict (org_id, clave) do update set
    nombre    = excluded.nombre,
    grupo     = excluded.grupo,
    codigo_pt = excluded.codigo_pt,
    orden     = excluded.orden,
    alias     = excluded.alias;
end $$;
