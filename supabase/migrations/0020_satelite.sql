-- ============================================================================
-- Kenzly CASFA — SateliteSIC: indices de vegetacion Sentinel-2 por parcela
-- ----------------------------------------------------------------------------
-- Guarda la serie de tiempo de NDVI/EVI/NDWI que devuelve la Statistical API de
-- Sentinel Hub (Copernicus Data Space) para el poligono EXACTO de cada parcela.
-- Una fila = una parcela en una fecha de imagen. La alerta se calcula en el
-- servidor (lib/satelite/indices.ts) y se persiste aqui para poder filtrar y
-- pintar el mapa sin recalcular.
--
-- Ejecutar en el SQL Editor de Supabase DESPUES de 0019.
-- ============================================================================

create table if not exists parcela_indices_satelitales (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizaciones(id) on delete cascade,
  parcela_id        uuid not null references parcelas(id) on delete cascade,
  fecha_imagen      date not null,
  satelite          text default 'Sentinel-2',
  ndvi_promedio     numeric(6,4),
  ndvi_min          numeric(6,4),
  ndvi_max          numeric(6,4),
  evi_promedio      numeric(6,4),
  ndwi_promedio     numeric(6,4),
  cobertura_nubes   numeric(5,2),
  imagen_ndvi_url   text,
  alerta            text check (alerta in (
                      'normal','estres_hidrico',
                      'posible_enfermedad','critico','sin_datos')),
  created_at        timestamptz not null default now(),
  unique (parcela_id, fecha_imagen)
);

-- El mapa pide "el ultimo indice de cada parcela": indice descendente por fecha.
create index if not exists indices_sat_parcela_fecha_idx
  on parcela_indices_satelitales (parcela_id, fecha_imagen desc);
create index if not exists indices_sat_org_alerta_idx
  on parcela_indices_satelitales (org_id, alerta);

alter table parcela_indices_satelitales enable row level security;
drop policy if exists org_isolation on parcela_indices_satelitales;
create policy org_isolation on parcela_indices_satelitales
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on parcela_indices_satelitales to authenticated;

-- ----------------------------------------------------------------------------
-- 1. Lista plana: parcela + productor + su indice MAS RECIENTE (o nulls).
--    Mismo contrato que get_parcelas_geo() para que la vista se sienta igual.
-- ----------------------------------------------------------------------------
create or replace function get_parcelas_satelite()
returns table (
  id                      uuid,
  codigo_parcela          text,
  nombre                  text,
  tipo_cultivo            tipo_cultivo,
  superficie_declarada_ha numeric,
  comunidad               text,
  municipio               text,
  productor_id            uuid,
  productor_codigo        text,
  productor_nombre        text,
  tiene_poligono          boolean,
  area_calc_ha            numeric,
  centroide_lat           numeric,
  centroide_lng           numeric,
  fecha_imagen            date,
  ndvi_promedio           numeric,
  ndvi_min                numeric,
  ndvi_max                numeric,
  evi_promedio            numeric,
  ndwi_promedio           numeric,
  cobertura_nubes         numeric,
  alerta                  text
)
language sql
stable
security invoker
as $$
  select
    p.id,
    p.codigo_parcela,
    p.nombre,
    p.tipo_cultivo,
    p.superficie_declarada_ha,
    p.comunidad,
    p.municipio,
    pr.id              as productor_id,
    pr.codigo          as productor_codigo,
    pr.nombre_completo as productor_nombre,
    (poly.id is not null) as tiene_poligono,
    poly.area_calc_ha,
    poly.centroide_lat,
    poly.centroide_lng,
    ix.fecha_imagen,
    ix.ndvi_promedio,
    ix.ndvi_min,
    ix.ndvi_max,
    ix.evi_promedio,
    ix.ndwi_promedio,
    ix.cobertura_nubes,
    ix.alerta
  from parcelas p
  join productores pr on pr.id = p.productor_id
  left join lateral (
    select pp.id, pp.area_calc_ha, pp.centroide_lat, pp.centroide_lng
    from parcela_poligonos pp
    where pp.parcela_id = p.id and pp.activo and pp.geom is not null
    order by pp.version desc
    limit 1
  ) poly on true
  left join lateral (
    select s.*
    from parcela_indices_satelitales s
    where s.parcela_id = p.id
    order by s.fecha_imagen desc
    limit 1
  ) ix on true
  order by pr.nombre_completo, p.codigo_parcela;
$$;

-- ----------------------------------------------------------------------------
-- 2. Poligonos como GeoJSON para mandarlos a Sentinel Hub.
--    p_ids null => todas las parcelas con poligono activo (de las orgs del user).
--    Devuelve tambien el area para poder saltarnos poligonos absurdamente chicos.
-- ----------------------------------------------------------------------------
create or replace function get_poligonos_satelite(p_ids uuid[] default null)
returns table (
  parcela_id     uuid,
  codigo_parcela text,
  area_calc_ha   numeric,
  geojson        json
)
language sql
stable
security invoker
as $$
  select
    pp.parcela_id,
    p.codigo_parcela,
    pp.area_calc_ha,
    ST_AsGeoJSON(pp.geom)::json as geojson
  from parcela_poligonos pp
  join parcelas p on p.id = pp.parcela_id
  where pp.activo
    and pp.geom is not null
    and (p_ids is null or pp.parcela_id = any(p_ids))
  order by p.codigo_parcela;
$$;

-- ----------------------------------------------------------------------------
-- 3. Serie historica de una parcela (para la grafica del panel).
-- ----------------------------------------------------------------------------
create or replace function get_indices_historial(
  p_parcela_id uuid,
  p_meses      int default 6
)
returns table (
  fecha_imagen    date,
  ndvi_promedio   numeric,
  evi_promedio    numeric,
  ndwi_promedio   numeric,
  cobertura_nubes numeric,
  alerta          text
)
language sql
stable
security invoker
as $$
  select
    s.fecha_imagen,
    s.ndvi_promedio,
    s.evi_promedio,
    s.ndwi_promedio,
    s.cobertura_nubes,
    s.alerta
  from parcela_indices_satelitales s
  where s.parcela_id = p_parcela_id
    and s.fecha_imagen >= (current_date - (p_meses || ' months')::interval)
  order by s.fecha_imagen;
$$;

-- ----------------------------------------------------------------------------
-- 4. Upsert de un indice. El org_id se resuelve AQUI desde la parcela: el
--    cliente nunca lo manda (regla 1 del proyecto).
--    Idempotente por (parcela_id, fecha_imagen): re-procesar el mismo rango
--    actualiza en vez de duplicar.
-- ----------------------------------------------------------------------------
create or replace function upsert_indice_satelital(
  p_parcela_id      uuid,
  p_fecha_imagen    date,
  p_ndvi_promedio   numeric,
  p_ndvi_min        numeric,
  p_ndvi_max        numeric,
  p_evi_promedio    numeric,
  p_ndwi_promedio   numeric,
  p_cobertura_nubes numeric,
  p_alerta          text,
  p_satelite        text default 'Sentinel-2'
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_org uuid;
  v_id  uuid;
begin
  -- RLS ya garantiza que el usuario solo ve parcelas de su organizacion.
  select org_id into v_org from parcelas where id = p_parcela_id;
  if v_org is null then
    raise exception 'Parcela % no encontrada o sin acceso', p_parcela_id;
  end if;

  insert into parcela_indices_satelitales (
    org_id, parcela_id, fecha_imagen, satelite,
    ndvi_promedio, ndvi_min, ndvi_max,
    evi_promedio, ndwi_promedio, cobertura_nubes, alerta
  ) values (
    v_org, p_parcela_id, p_fecha_imagen, p_satelite,
    p_ndvi_promedio, p_ndvi_min, p_ndvi_max,
    p_evi_promedio, p_ndwi_promedio, p_cobertura_nubes, p_alerta
  )
  on conflict (parcela_id, fecha_imagen) do update set
    ndvi_promedio   = excluded.ndvi_promedio,
    ndvi_min        = excluded.ndvi_min,
    ndvi_max        = excluded.ndvi_max,
    evi_promedio    = excluded.evi_promedio,
    ndwi_promedio   = excluded.ndwi_promedio,
    cobertura_nubes = excluded.cobertura_nubes,
    alerta          = excluded.alerta,
    satelite        = excluded.satelite
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function get_parcelas_satelite()                to authenticated;
grant execute on function get_poligonos_satelite(uuid[])         to authenticated;
grant execute on function get_indices_historial(uuid, int)       to authenticated;
grant execute on function upsert_indice_satelital(
  uuid, date, numeric, numeric, numeric, numeric, numeric, numeric, text, text
) to authenticated;

-- Recarga el cache de PostgREST para que vea la tabla y las funciones nuevas.
notify pgrst, 'reload schema';
