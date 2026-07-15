-- ============================================================================
-- Kenzly CASFA — Módulo 7: Remisión de campo (trazabilidad del saco)
-- ----------------------------------------------------------------------------
-- Marca el café DESDE EL CAMPO, antes de que el camión lo recoja, para que
-- llegue al beneficio ya identificado con su productor. Cierra el hueco que
-- hoy existe: entre que el productor entrega y que se abre la boleta de
-- entrada, el café no tiene dueño rastreable.
--
-- Cadena completa, ya con este eslabón:
--   remision (campo) → entradas (boleta) → maquila → lote → embarque
--
-- Decisiones que vienen de cómo trabaja CASFA de verdad:
--
--   1. LA ETIQUETA NO LLEVA DATOS, LLEVA UN ID.
--      Los kilos se pesan en el BENEFICIO, no en campo. Una etiqueta que
--      imprimiera kilos nacería mintiendo. Lleva un código opaco; el nombre, la
--      comunidad, el tipo y el peso viven aquí, contra ese código.
--
--   2. LA ETIQUETA ES DESECHABLE, NO PERMANENTE.
--      Los sacos se reúsan entre cosechas. Atar la identidad al saco físico
--      haría que el café de este año heredara el productor del año pasado. Por
--      eso una etiqueta = una entrega, y se consume.
--
--   3. SE PRE-IMPRIME EN LA OFICINA, EN BLANCO.
--      No hay impresora en las comunidades. Se imprimen rollos de códigos
--      opacos (etiqueta_impresion) y el promotor los "activa" escaneándolos
--      junto al productor. El dígito verificador Damm del código (ver
--      lib/remision/codigo.mjs) deja que la app valide sin red.
--
--   4. kg_declarado NO ES AUTORIDAD.
--      El productor a veces trae una idea de cuántos kilos lleva. Se guarda,
--      pero la báscula del beneficio manda. Guardar ambos es lo que permite
--      detectar el faltante entre lo que salió del campo y lo que llegó.
--
-- Ejecutar después de 0025.
-- ============================================================================

do $$ begin
  create type estado_remision as enum (
    'en_campo',    -- capturada por el promotor, aún no llega
    'recibida',    -- escaneada en el beneficio y ligada a una boleta
    'cancelada'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Tandas de etiquetas impresas. Existe para poder responder la pregunta que
-- hace un auditor orgánico: "¿esta etiqueta se imprimió, o apareció?".
-- ----------------------------------------------------------------------------
create table if not exists etiqueta_impresion (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizaciones(id) on delete cascade,
  ciclo       text not null,                  -- '2025-2026'
  prefijo     text not null default 'CAS',
  desde       int  not null,                  -- consecutivo inicial
  hasta       int  not null,                  -- consecutivo final
  cantidad    int  not null,
  creada_por  uuid references usuarios(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (hasta >= desde)
);
alter table etiqueta_impresion enable row level security;
drop policy if exists org_isolation on etiqueta_impresion;
create policy org_isolation on etiqueta_impresion
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on etiqueta_impresion to authenticated;

-- ----------------------------------------------------------------------------
-- Cada etiqueta impresa, individual. `usada` la marca el trigger del saco.
-- ----------------------------------------------------------------------------
create table if not exists etiqueta (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizaciones(id) on delete cascade,
  codigo       text not null,                 -- 'CAS-26-04871-4'
  ciclo        text not null,
  impresion_id uuid references etiqueta_impresion(id) on delete set null,
  usada        boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (org_id, codigo)
);
create index if not exists etiqueta_libre_idx on etiqueta (org_id, ciclo) where not usada;

alter table etiqueta enable row level security;
drop policy if exists org_isolation on etiqueta;
create policy org_isolation on etiqueta
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on etiqueta to authenticated;

-- ----------------------------------------------------------------------------
-- Remisión: lo que un productor entrega en campo, en una fecha.
-- ----------------------------------------------------------------------------
create table if not exists remisiones (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  folio         int not null,                  -- consecutivo visible por org

  -- Idempotencia de la sincronización offline: el promotor genera este uuid en
  -- el celular. Si el envío se reintenta (red intermitente en la sierra), el
  -- upsert por local_id evita la remisión duplicada.
  local_id      uuid not null,

  fecha_remision date not null default current_date,
  ciclo         text not null,

  productor_id  uuid references productores(id) on delete set null,
  proveedor_nombre text not null,              -- snapshot
  comunidad     text,
  municipio     text,

  especie       text not null,                 -- ARABE | ROBUSTA | CACAO
  tipo          text not null,                 -- PERGAMINO | CEREZO | ...
  material_saco text,                          -- plastico | yute | henequen

  total_sacos   int not null default 0,        -- cuántos dice el promotor
  -- Lo que el productor CREE que lleva. No es autoridad: la báscula del
  -- beneficio manda. Sirve para detectar el faltante en el traslado.
  kg_declarado  numeric(12,2),

  promotor_id   uuid references usuarios(id) on delete set null,
  lat           numeric(10,6),
  lng           numeric(10,6),
  observaciones text,

  estado        estado_remision not null default 'en_campo',
  entrada_id    uuid references entradas(id) on delete set null,
  recibida_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, folio),
  unique (org_id, local_id)
);
create index if not exists remisiones_estado_idx    on remisiones (org_id, estado, fecha_remision desc);
create index if not exists remisiones_productor_idx on remisiones (productor_id);
create index if not exists remisiones_entrada_idx   on remisiones (entrada_id);

alter table remisiones enable row level security;
drop policy if exists org_isolation on remisiones;
create policy org_isolation on remisiones
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on remisiones to authenticated;

-- Folio consecutivo por org (mismo patrón que acopio_asignar_folio).
create table if not exists remision_contador (
  org_id       uuid primary key references organizaciones(id) on delete cascade,
  ultimo_folio int not null default 0
);
alter table remision_contador enable row level security;
drop policy if exists org_isolation on remision_contador;
create policy org_isolation on remision_contador
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on remision_contador to authenticated;

create or replace function remision_asignar_folio() returns trigger as $$
declare v_folio int;
begin
  if new.folio is not null and new.folio > 0 then return new; end if;
  insert into remision_contador (org_id, ultimo_folio) values (new.org_id, 0)
    on conflict (org_id) do nothing;
  update remision_contador set ultimo_folio = ultimo_folio + 1
   where org_id = new.org_id
  returning ultimo_folio into v_folio;
  new.folio := v_folio;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_remision_folio on remisiones;
create trigger trg_remision_folio before insert on remisiones
  for each row execute function remision_asignar_folio();

-- ----------------------------------------------------------------------------
-- Un renglón por SACO físico. Aquí vive la trazabilidad fina.
--
-- `recibido_at` lo marca el beneficio al escanear. La diferencia entre los
-- sacos escaneados en campo y los escaneados al recibir es el faltante del
-- traslado — hoy eso no se puede ni preguntar.
-- ----------------------------------------------------------------------------
create table if not exists remision_saco (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizaciones(id) on delete cascade,
  remision_id uuid not null references remisiones(id) on delete cascade,
  etiqueta_id uuid not null references etiqueta(id) on delete restrict,

  orden       int not null default 0,
  recibido_at timestamptz,
  recibido_por uuid references usuarios(id) on delete set null,

  -- Una etiqueta se usa UNA vez. Es la garantía de que no se puede duplicar
  -- la identidad de un saco (ni por error de captura, ni a propósito).
  unique (etiqueta_id)
);
create index if not exists remision_saco_remision_idx on remision_saco (remision_id);

alter table remision_saco enable row level security;
drop policy if exists org_isolation on remision_saco;
create policy org_isolation on remision_saco
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on remision_saco to authenticated;

-- Marcar la etiqueta como usada / liberarla si el saco se borra.
create or replace function remision_saco_marcar_etiqueta() returns trigger as $$
begin
  if tg_op = 'DELETE' then
    update etiqueta set usada = false where id = old.etiqueta_id;
    return old;
  end if;
  update etiqueta set usada = true where id = new.etiqueta_id;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_remision_saco_etiqueta on remision_saco;
create trigger trg_remision_saco_etiqueta
  after insert or delete on remision_saco
  for each row execute function remision_saco_marcar_etiqueta();

-- ----------------------------------------------------------------------------
-- La boleta de entrada apunta a la remisión que la originó.
-- ----------------------------------------------------------------------------
alter table entradas
  add column if not exists remision_id uuid references remisiones(id) on delete set null;
create index if not exists entradas_remision_idx on entradas (remision_id);

-- ----------------------------------------------------------------------------
-- v_remision_cuadre — el reporte que hoy no existe: qué salió del campo, qué
-- llegó al beneficio, y qué falta.
-- ----------------------------------------------------------------------------
create or replace view v_remision_cuadre as
select
  r.org_id,
  r.id                                as remision_id,
  r.folio,
  r.fecha_remision,
  r.ciclo,
  r.proveedor_nombre,
  r.comunidad,
  r.especie,
  r.tipo,
  r.estado,
  r.total_sacos                       as sacos_declarados,
  count(s.id)                         as sacos_etiquetados,
  count(s.recibido_at)                as sacos_recibidos,
  count(s.id) - count(s.recibido_at)  as sacos_faltantes,
  r.kg_declarado,
  e.folio                             as boleta_folio,
  e.kg_netos                          as kg_pesados,
  -- Lo declarado en campo contra lo que dio la báscula. Positivo = llegó menos.
  case when r.kg_declarado is not null and e.kg_netos is not null
       then r.kg_declarado - e.kg_netos end as kg_diferencia
from remisiones r
left join remision_saco s on s.remision_id = r.id
left join entradas e      on e.id = r.entrada_id
group by r.id, e.folio, e.kg_netos;

grant select on v_remision_cuadre to authenticated;
