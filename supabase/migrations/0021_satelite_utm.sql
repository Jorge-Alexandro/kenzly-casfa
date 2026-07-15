-- ============================================================================
-- Kenzly CASFA — SateliteSIC: corrige la resolucion de muestreo (UTM)
-- ----------------------------------------------------------------------------
-- BUG que arregla esta migracion:
-- Sentinel Hub interpreta resx/resy EN LAS UNIDADES DEL CRS que le mandas. Si
-- el poligono va en lon/lat (4326), pedir resx=10 significa "pixeles de 10
-- GRADOS": una parcela de 4 ha se medía con UN solo pixel remuestreado y el
-- NDVI/min/max salian practicamente inventados (min == max == mean).
--
-- Sentinel-2 se distribuye en rejilla UTM, asi que reproyectamos el poligono a
-- su zona UTM y ahi resx=10 SI son 10 metros reales, alineados a la rejilla
-- nativa del satelite (cero remuestreo).
--
-- La zona UTM se deriva del centroide, no se hardcodea: CASFA esta en la 15N
-- (EPSG:32615), pero si mañana entra una organizacion en otra zona, funciona.
--
-- Ejecutar en el SQL Editor de Supabase DESPUES de 0020.
-- ============================================================================

-- Postgres no deja cambiar el tipo de retorno con `create or replace` (le
-- agregamos la columna srid), asi que hay que tirar la version de 0020 primero.
drop function if exists get_poligonos_satelite(uuid[]);

create function get_poligonos_satelite(p_ids uuid[] default null)
returns table (
  parcela_id     uuid,
  codigo_parcela text,
  area_calc_ha   numeric,
  srid           int,
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
    -- 326xx = UTM norte. Chiapas (lon ~ -92.3) cae en la zona 15 -> 32615.
    (32600 + floor((ST_X(ST_Centroid(pp.geom)) + 180) / 6)::int + 1) as srid,
    ST_AsGeoJSON(
      ST_Transform(
        pp.geom,
        32600 + floor((ST_X(ST_Centroid(pp.geom)) + 180) / 6)::int + 1
      )
    )::json as geojson
  from parcela_poligonos pp
  join parcelas p on p.id = pp.parcela_id
  where pp.activo
    and pp.geom is not null
    and (p_ids is null or pp.parcela_id = any(p_ids))
  order by p.codigo_parcela;
$$;

grant execute on function get_poligonos_satelite(uuid[]) to authenticated;

notify pgrst, 'reload schema';
