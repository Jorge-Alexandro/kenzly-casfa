-- ============================================================================
-- Kenzly CASFA — Módulo Agroecología/SIC: Estimación de cosecha (café y cacao)
-- ----------------------------------------------------------------------------
-- Digitaliza las boletas "Estimación de cosecha de café" y "…de cacao". Su
-- salida (kg/qq/TM/rendimiento por parcela y ciclo) alimenta POR IGUAL:
--   - el LPA (columnas de producción por cultivo), y
--   - los inventarios/KPIs del programa de Agroecología.
--
-- El cálculo lo hace la app con src/lib/agroecologia/estimacion.mjs (autoridad,
-- verificado contra las boletas). Aquí sólo persistimos captura + resultado.
-- Config (IM del cacao, factores del café, constante) va como DATOS en
-- estimacion_regla, no en código.
-- Ejecutar después de 0010.
-- ============================================================================

do $$ begin
  create type estimacion_metodo as enum ('cafe', 'cacao');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Reglas configurables por organización y método.
--   cafe:  { constante:640000, oro_kg:45.35,
--            factores:[{hasta:35,factor:51},{hasta:75,factor:100},{hasta:null,factor:162}] }
--   cacao: { im:22, muestra_arboles:10 }
-- ----------------------------------------------------------------------------
create table if not exists estimacion_regla (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organizaciones(id) on delete cascade,
  metodo   estimacion_metodo not null,
  params   jsonb not null default '{}'::jsonb,
  unique (org_id, metodo)
);
alter table estimacion_regla enable row level security;
drop policy if exists org_isolation on estimacion_regla;
create policy org_isolation on estimacion_regla
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on estimacion_regla to authenticated;

-- ----------------------------------------------------------------------------
-- Estimación de cosecha: una por (parcela, ciclo, cultivo).
-- ----------------------------------------------------------------------------
create table if not exists estimacion_cosecha (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  parcela_id    uuid not null references parcelas(id) on delete cascade,
  productor_id  uuid references productores(id) on delete set null, -- denormalizado para filtrar
  ciclo         text not null,                 -- temporada, p.ej. "2025-2026"
  cultivo       text not null,                 -- cafe_arabe | cafe_robusta | cacao | ...
  metodo        estimacion_metodo not null,    -- qué fórmula aplica

  -- Captura cruda de la boleta (café: grid/promedio de bandolas; cacao: bins).
  muestra       jsonb not null default '{}'::jsonb,

  -- Insumos usados en el cálculo (snapshot).
  promedio      numeric(12,4),                 -- cerezo/bandola (café) o mazorcas/árbol (cacao)
  factor_o_im   numeric(10,3),                 -- factor de carga (café) o IM (cacao)
  plantas_ha    int,                           -- café
  n_arboles     int,                           -- cacao
  superficie_ha numeric(10,4),

  -- Resultado calculado por el motor.
  kg_estimado   numeric(14,2),
  qq_estimado   numeric(14,3),                 -- café (oro); null en cacao
  tm            numeric(12,4),
  rendimiento_kg_ha numeric(12,2),

  -- Negociación con el productor (§ "se promedia a conveniencia").
  valor_productor_kg numeric(14,2),
  valor_final_kg     numeric(14,2),

  fecha         date not null default current_date,
  inspector_id  uuid references usuarios(id) on delete set null,
  comentarios   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (parcela_id, ciclo, cultivo)
);
create index if not exists estimacion_org_ciclo_idx on estimacion_cosecha (org_id, ciclo);
create index if not exists estimacion_parcela_idx    on estimacion_cosecha (parcela_id);
create index if not exists estimacion_productor_idx  on estimacion_cosecha (productor_id);

alter table estimacion_cosecha enable row level security;
drop policy if exists org_isolation on estimacion_cosecha;
create policy org_isolation on estimacion_cosecha
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on estimacion_cosecha to authenticated;

-- ----------------------------------------------------------------------------
-- Semilla de reglas para CASFA (idempotente).
-- ----------------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  select id into v_org from organizaciones where slug = 'casfa';
  if v_org is null then
    raise notice 'org casfa no encontrada; omito semilla de estimación';
    return;
  end if;

  insert into estimacion_regla (org_id, metodo, params) values
    (v_org, 'cafe', jsonb_build_object(
      'constante', 640000,
      'oro_kg', 45.35,
      -- kg por quintal según la base física del cultivo (1 quintal invariante):
      -- robusta se reporta en cereza (80), árabe en pergamino (57.5), oro=45.35.
      'kg_por_quintal', jsonb_build_object(
        'cafe_robusta', 80,
        'cafe_arabe', 57.5,
        'oro', 45.35
      ),
      'factores', jsonb_build_array(
        jsonb_build_object('hasta', 35, 'factor', 51),
        jsonb_build_object('hasta', 75, 'factor', 100),
        jsonb_build_object('hasta', null, 'factor', 162)
      ))),
    (v_org, 'cacao', jsonb_build_object('im', 22, 'muestra_arboles', 10))
  on conflict (org_id, metodo) do update set params = excluded.params;
end $$;
