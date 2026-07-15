-- ============================================================================
-- Kenzly CASFA — Módulo Agroecología: talleres, avances (asistencia) y KPIs
-- ----------------------------------------------------------------------------
-- Modela lo que hoy vive en los xlsx de "AVANCES" (café y cultivos tropicales):
-- una matriz por comunidad × tipo de taller con F/M y % de avance, donde
--   Avance = (F + M) / Socios  = % de asistencia de la comunidad a ese taller.
-- De aquí salen los KPIs del centro (talleres, personas, plantas, superficie,
-- abono, % asistencia). Los tipos de taller varían por programa → configurables.
-- Ejecutar después de 0012.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Programa por ciclo (Café / Cultivos Tropicales / …)
-- ----------------------------------------------------------------------------
create table if not exists agro_programa (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizaciones(id) on delete cascade,
  nombre     text not null,                    -- "Café", "Cultivos Tropicales"
  ciclo      text not null,                    -- "2023-2024", "2025-2026"
  created_at timestamptz not null default now(),
  unique (org_id, nombre, ciclo)
);
alter table agro_programa enable row level security;
drop policy if exists org_isolation on agro_programa;
create policy org_isolation on agro_programa
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on agro_programa to authenticated;

-- ----------------------------------------------------------------------------
-- Tipos de taller del programa (configurable; el orden fija las columnas).
-- ----------------------------------------------------------------------------
create table if not exists agro_tipo_taller (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizaciones(id) on delete cascade,
  programa_id uuid not null references agro_programa(id) on delete cascade,
  clave       text not null,                   -- bitacora | conservacion_suelo | mip | poda …
  nombre      text not null,                   -- etiqueta visible
  orden       int not null default 0,
  unique (programa_id, clave)
);
alter table agro_tipo_taller enable row level security;
drop policy if exists org_isolation on agro_tipo_taller;
create policy org_isolation on agro_tipo_taller
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on agro_tipo_taller to authenticated;

-- ----------------------------------------------------------------------------
-- Comunidades del programa: el roster con nº de socios (denominador del % de
-- asistencia) y superficie. Plantas/abono entregados por comunidad (KPIs).
-- ----------------------------------------------------------------------------
create table if not exists agro_comunidad (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizaciones(id) on delete cascade,
  programa_id        uuid not null references agro_programa(id) on delete cascade,
  comunidad          text not null,
  municipio          text,
  socios             int not null default 0,
  hectareas          numeric(12,2) not null default 0,
  plantas_entregadas int not null default 0,
  abono_ton          numeric(12,3) not null default 0,
  orden              int not null default 0,
  unique (programa_id, comunidad)
);
create index if not exists agro_comunidad_prog_idx on agro_comunidad (programa_id);
alter table agro_comunidad enable row level security;
drop policy if exists org_isolation on agro_comunidad;
create policy org_isolation on agro_comunidad
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on agro_comunidad to authenticated;

-- ----------------------------------------------------------------------------
-- Avance = celda de la matriz (comunidad × tipo de taller).
-- impartido: si se dio el taller en esa comunidad (marca "X"); f/m = asistentes
-- por sexo; avance = fracción de asistencia (0..1). Lo calcula la app.
-- ----------------------------------------------------------------------------
create table if not exists agro_avance (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  programa_id    uuid not null references agro_programa(id) on delete cascade,
  comunidad_id   uuid not null references agro_comunidad(id) on delete cascade,
  tipo_taller_id uuid not null references agro_tipo_taller(id) on delete cascade,
  impartido      boolean not null default false,
  f              int not null default 0,
  m              int not null default 0,
  avance         numeric(6,4) not null default 0,  -- (f+m)/socios
  updated_at     timestamptz not null default now(),
  unique (comunidad_id, tipo_taller_id)
);
create index if not exists agro_avance_prog_idx on agro_avance (programa_id);
alter table agro_avance enable row level security;
drop policy if exists org_isolation on agro_avance;
create policy org_isolation on agro_avance
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on agro_avance to authenticated;
