-- ============================================================================
-- Kenzly GeoOps — Bitácora anual (calendario de actividades por parcela/año)
-- ----------------------------------------------------------------------------
-- La bitácora real de CASFA es una matriz: filas = actividades predefinidas
-- (LIMPIA, PODA, AGOBIAR, ...), columnas = 12 meses × 2 quincenas (15/30),
-- celdas marcadas + Gastos por actividad; más una tabla de insumos y
-- observaciones. Lo guardamos como un registro por (parcela, año) con el grid
-- en JSONB — encaja mejor que filas sueltas y se renderea idéntico al .docx.
--
-- Café y tropical comparten el MISMO formato, así que una sola tabla sirve.
-- Ejecutar después de 0005.
-- ============================================================================

create table if not exists bitacora_anual (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  parcela_id    uuid not null references parcelas(id) on delete cascade,
  anio          int not null,
  -- datos: { actividades: [{id,nombre,grupo,gastos,marcas:bool[24]}],
  --          insumos: [{nombre_producto,ingrediente_activo,ingredientes_inertes,
  --                     origen,dosis_kg_ha,fecha_aplicacion}],
  --          observaciones: text }
  datos         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (parcela_id, anio)
);
create index if not exists bitacora_anual_org_idx on bitacora_anual (org_id, parcela_id);

alter table bitacora_anual enable row level security;

drop policy if exists org_isolation on bitacora_anual;
create policy org_isolation on bitacora_anual
  using (es_miembro(org_id))
  with check (es_miembro(org_id));

grant select, insert, update, delete on bitacora_anual to authenticated;
