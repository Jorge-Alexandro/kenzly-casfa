-- ============================================================================
-- Kenzly CASFA — SIC: Historial de certificación (espina del LPA) + bajas
-- ----------------------------------------------------------------------------
-- El LPA lleva, por productor, el "Nivel de Certificación" de cada año con la
-- progresión NUEVO → T1 → T2 → T3 → Orgánico (3 años a orgánico). Las sanciones
-- bajan el nivel; las bajas (voluntaria/defunción) sacan al productor.
--
-- Modelado como la "buena base de datos" que el LPA (entregable anual a MAYACERT)
-- no es: un renglón de estatus por (productor, año). El LPA se GENERA de aquí.
-- El estatus es por PRODUCTOR (en los archivos LPA todas las parcelas de un
-- productor comparten nivel).
-- Ejecutar después de 0011.
-- ============================================================================

do $$ begin
  create type nivel_certificacion as enum ('nuevo', 't1', 't2', 't3', 'organico');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_baja as enum ('voluntaria', 'defuncion', 'sancion', 'otro');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Estatus de certificación por (productor, año).
-- origen: cómo llegó a ese nivel (ingreso / promoción anual / sanción / ratifica).
-- ----------------------------------------------------------------------------
create table if not exists certificacion_estatus (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  productor_id  uuid not null references productores(id) on delete cascade,
  anio          int not null,
  nivel         nivel_certificacion not null,
  origen        text not null default 'ratificacion',  -- ingreso|promocion|sancion|ratificacion
  motivo        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (productor_id, anio)
);
create index if not exists cert_estatus_org_anio_idx on certificacion_estatus (org_id, anio);
create index if not exists cert_estatus_productor_idx on certificacion_estatus (productor_id);

alter table certificacion_estatus enable row level security;
drop policy if exists org_isolation on certificacion_estatus;
create policy org_isolation on certificacion_estatus
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on certificacion_estatus to authenticated;

-- ----------------------------------------------------------------------------
-- Bajas de productor (una vigente por productor; reactivar = borrar el renglón).
-- ----------------------------------------------------------------------------
create table if not exists productor_baja (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  productor_id  uuid not null references productores(id) on delete cascade,
  tipo          tipo_baja not null default 'voluntaria',
  motivo        text,
  fecha         date not null default current_date,
  anio          int,
  nivel_al_baja nivel_certificacion,           -- nivel que tenía al darse de baja
  created_at    timestamptz not null default now(),
  unique (productor_id)
);
create index if not exists productor_baja_org_idx on productor_baja (org_id);

alter table productor_baja enable row level security;
drop policy if exists org_isolation on productor_baja;
create policy org_isolation on productor_baja
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on productor_baja to authenticated;
