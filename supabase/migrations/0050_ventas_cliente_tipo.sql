-- Ventas — Fase 1 (cimientos): un solo cliente "XEXX010101000" no puede seguir
-- representando a Ruta Maya, Royal Coffee, Bijdendijk, Meo-Fichaux… a la vez.
-- México usa RFC genéricos para quien no tiene RFC mexicano: XEXX010101000
-- (extranjero) y XAXX010101000 (público en general). El unique(org_id, rfc)
-- original colapsaba TODOS los clientes de exportación (25% de las facturas
-- reales) en una sola fila — inutilizando cualquier KPI "top cliente".
--
-- tipo_cliente y nombre_normalizado se calculan solos (trigger) a partir de
-- rfc/nombre, para que NINGÚN punto de alta (CFDI, CRM, importador) tenga que
-- acordarse de llenarlos. La nueva unicidad es (org_id, rfc, nombre_normalizado):
--   · RFC real → sigue siendo 1 cliente (ya verificado: 1 nombre por RFC real).
--   · XEXX (extranjero) → se separa por nombre normalizado: cada empresa,
--     su fila. Variantes de mayúsculas/espacios de LA MISMA empresa sí se
--     funden (mismo nombre_normalizado).
--   · XAXX (público) → la aplicación siempre manda el mismo nombre canónico
--     al importar, así que colapsa a UNA sola fila a propósito.

alter table ventas_cliente
  add column if not exists tipo_cliente text,
  add column if not exists pais text,
  add column if not exists nombre_normalizado text;

-- Deriva nacional/exportación/público del RFC. El nodo cfdi:ComercioExterior
-- del XML es más preciso para el caso raro de una RFC nacional facturando una
-- exportación definitiva, pero eso requeriría pasar ese dato hasta aquí; por
-- ahora el RFC genérico ya cubre el caso real observado (71 facturas XEXX).
create or replace function ventas_tipo_cliente_de_rfc(rfc text) returns text as $$
begin
  return case upper(trim(coalesce(rfc, '')))
    when 'XEXX010101000' then 'exportacion'
    when 'XAXX010101000' then 'publico'
    else 'nacional'
  end;
end;
$$ language plpgsql immutable;

-- Mayúsculas, sin acentos, sin puntuación, espacios colapsados, sin los
-- sufijos legales más comunes — sólo para AGRUPAR variantes de escritura de
-- la MISMA empresa (p.ej. "Meo Fichaux SAS" y "MEO-FICHAUX SAS"). No intenta
-- fusionar nombres que no comparten estructura (eso es decisión de quien da
-- de alta al cliente, no de un normalizador — ver docs/plan-ventas.md §1.3).
create or replace function ventas_normalizar_nombre(nombre text) returns text as $$
declare
  t text;
begin
  t := upper(trim(coalesce(nombre, '')));
  t := translate(t, 'ÁÉÍÓÚÑÜÀÈÌÒÙ', 'AEIOUNUAEIOU');
  t := regexp_replace(t, '[.,]', '', 'g');
  t := regexp_replace(t, '[-/]', ' ', 'g');
  t := regexp_replace(t, '\s+', ' ', 'g');
  t := regexp_replace(t, '\s+(SA DE CV|S DE RL DE CV|SC DE RL DE CV|SAPI DE CV|SC DE RL|SOFOM|LLC|LTD|LTDA|INC|CORP)$', '', 'g');
  return trim(t);
end;
$$ language plpgsql immutable;

create or replace function ventas_cliente_normalizar() returns trigger as $$
begin
  new.rfc := upper(trim(new.rfc));
  new.tipo_cliente := ventas_tipo_cliente_de_rfc(new.rfc);
  new.nombre_normalizado := ventas_normalizar_nombre(new.nombre);
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ventas_cliente_normalizar on ventas_cliente;
create trigger trg_ventas_cliente_normalizar
  before insert or update of rfc, nombre on ventas_cliente
  for each row execute function ventas_cliente_normalizar();

-- Backfill de las filas que ya existan (dispara el trigger vía UPDATE no-op).
update ventas_cliente set rfc = rfc;

alter table ventas_cliente
  alter column tipo_cliente set not null,
  alter column nombre_normalizado set not null;

alter table ventas_cliente drop constraint if exists ventas_cliente_tipo_check;
alter table ventas_cliente
  add constraint ventas_cliente_tipo_check check (tipo_cliente in ('nacional', 'exportacion', 'publico'));

-- Quita el unique(org_id, rfc) original (busca por columnas, no por nombre:
-- el nombre real del constraint depende de cómo Postgres lo autogeneró).
do $$
declare c record;
begin
  for c in
    select tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    where tc.table_schema = 'public' and tc.table_name = 'ventas_cliente' and tc.constraint_type = 'UNIQUE'
    group by tc.constraint_name
    having array_agg(kcu.column_name::text order by kcu.column_name) = array['org_id', 'rfc']::text[]
  loop
    execute format('alter table ventas_cliente drop constraint %I', c.constraint_name);
  end loop;
end $$;

alter table ventas_cliente drop constraint if exists ventas_cliente_org_rfc_nombre_uk;
alter table ventas_cliente
  add constraint ventas_cliente_org_rfc_nombre_uk unique (org_id, rfc, nombre_normalizado);

notify pgrst, 'reload schema';
