-- ============================================================================
-- Kenzly GeoOps — GeoSIC RPC layer
-- ----------------------------------------------------------------------------
-- Ejecutar en el SQL Editor de Supabase DESPUES de casfa_core_schema.sql.
--
-- Estas funciones son la unica via por la que el frontend toca PostGIS:
--   - get_parcelas_geo()        -> lista plana parcela+productor+poligono activo
--   - get_parcela_polygons()    -> geometria activa como GeoJSON
--   - upsert_parcela_poligono() -> inserta geom (desde GeoJSON), versiona
--   - validar_poligono()        -> aprueba/revierte validacion (coordinador)
--
-- Todas corren con SECURITY INVOKER => RLS (es_miembro) se aplica naturalmente.
-- El frontend NUNCA recibe geometry/geography crudo, solo escalares o GeoJSON.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Lista plana de parcelas con su poligono activo (o nulls).
--    LEFT JOIN lateral al poligono activo mas reciente por parcela.
-- ----------------------------------------------------------------------------
create or replace function get_parcelas_geo()
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
  productor_comunidad     text,
  productor_municipio     text,
  poligono_id             uuid,
  area_calc_ha            numeric,
  perimetro_m             numeric,
  diferencia_ha           numeric,
  diferencia_pct          numeric,
  estado_validacion       estado_validacion,
  centroide_lat           numeric,
  centroide_lng           numeric,
  fecha_levantamiento     date,
  archivo_kml_url         text
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
    pr.id            as productor_id,
    pr.codigo        as productor_codigo,
    pr.nombre_completo as productor_nombre,
    pr.comunidad     as productor_comunidad,
    pr.municipio     as productor_municipio,
    poly.id          as poligono_id,
    poly.area_calc_ha,
    poly.perimetro_m,
    poly.diferencia_ha,
    poly.diferencia_pct,
    coalesce(poly.estado_validacion, 'sin_poligono'::estado_validacion) as estado_validacion,
    poly.centroide_lat,
    poly.centroide_lng,
    poly.fecha_levantamiento,
    coalesce(poly.archivo_kml_url, poly.archivo_kmz_url) as archivo_kml_url
  from parcelas p
  join productores pr on pr.id = p.productor_id
  left join lateral (
    select pp.*
    from parcela_poligonos pp
    where pp.parcela_id = p.id and pp.activo
    order by pp.version desc
    limit 1
  ) poly on true
  order by pr.nombre_completo, p.codigo_parcela;
$$;

-- ----------------------------------------------------------------------------
-- 2. Geometria activa como GeoJSON (para la fuente del mapa).
--    ST_AsGeoJSON -> json para evitar exponer WKB/geometry al cliente.
-- ----------------------------------------------------------------------------
create or replace function get_parcela_polygons()
returns table (
  parcela_id        uuid,
  estado_validacion estado_validacion,
  geojson           json
)
language sql
stable
security invoker
as $$
  select
    pp.parcela_id,
    pp.estado_validacion,
    ST_AsGeoJSON(pp.geom)::json as geojson
  from parcela_poligonos pp
  where pp.activo and pp.geom is not null;
$$;

-- ----------------------------------------------------------------------------
-- 3. Insertar/actualizar el poligono de una parcela desde GeoJSON.
--    - Desactiva versiones previas y crea una version nueva incremental.
--    - geom se construye con ST_GeomFromGeoJSON + SetSRID(4326).
--    - El trigger geo_recompute() calcula area/perimetro/centroide/estado.
--    Devuelve la fila resultante (escalares) como json.
-- ----------------------------------------------------------------------------
create or replace function upsert_parcela_poligono(
  p_parcela_id uuid,
  p_geojson    json,
  p_archivo_url text default null,
  p_es_kmz     boolean default false,
  p_metodo     metodo_levantamiento default 'google_earth'
)
returns json
language plpgsql
security invoker
as $$
declare
  v_org      uuid;
  v_version  int;
  v_geom     geometry(Polygon,4326);
  v_row      parcela_poligonos;
begin
  -- Resolver org de la parcela (RLS ya garantiza que el usuario la puede ver).
  select org_id into v_org from parcelas where id = p_parcela_id;
  if v_org is null then
    raise exception 'Parcela % no encontrada o sin acceso', p_parcela_id;
  end if;

  -- Construir geometria desde GeoJSON, forzando SRID 4326 (lon/lat).
  v_geom := ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::text), 4326);
  -- Normalizar a poligono valido (corrige auto-intersecciones simples).
  v_geom := ST_MakeValid(v_geom);
  if GeometryType(v_geom) <> 'POLYGON' then
    -- Si MakeValid devolvio un multipolygon, tomar el de mayor area.
    v_geom := (
      select geom from (
        select (ST_Dump(v_geom)).geom as geom
      ) d
      where GeometryType(geom) = 'POLYGON'
      order by ST_Area(geom::geography) desc
      limit 1
    );
  end if;

  -- Siguiente version y desactivar las anteriores.
  select coalesce(max(version), 0) + 1 into v_version
  from parcela_poligonos where parcela_id = p_parcela_id;

  update parcela_poligonos
    set activo = false
  where parcela_id = p_parcela_id and activo;

  insert into parcela_poligonos (
    org_id, parcela_id, version, activo, metodo,
    archivo_kml_url, archivo_kmz_url, geom,
    responsable_id, fecha_levantamiento
  ) values (
    v_org, p_parcela_id, v_version, true, p_metodo,
    case when p_es_kmz then null else p_archivo_url end,
    case when p_es_kmz then p_archivo_url else null end,
    v_geom,
    auth.uid(), current_date
  )
  returning * into v_row;

  return json_build_object(
    'id', v_row.id,
    'version', v_row.version,
    'area_calc_ha', v_row.area_calc_ha,
    'perimetro_m', v_row.perimetro_m,
    'diferencia_ha', v_row.diferencia_ha,
    'diferencia_pct', v_row.diferencia_pct,
    'estado_validacion', v_row.estado_validacion,
    'centroide_lat', v_row.centroide_lat,
    'centroide_lng', v_row.centroide_lng
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Validar (aprobar) o revertir un poligono.
--    aprobar=true  -> estado 'validado' + sello de quien/cuando.
--    aprobar=false -> limpia el sello y deja que el trigger recalcule el estado
--                     "automatico" (preliminar/revisar/critico) tocando la fila.
-- ----------------------------------------------------------------------------
create or replace function validar_poligono(
  p_poligono_id uuid,
  p_aprobar     boolean
)
returns json
language plpgsql
security invoker
as $$
declare
  v_row parcela_poligonos;
begin
  if p_aprobar then
    update parcela_poligonos
      set estado_validacion = 'validado',
          validado_por      = auth.uid(),
          fecha_validacion  = current_date
    where id = p_poligono_id
    returning * into v_row;
  else
    -- Poner un estado != 'validado' permite que el trigger reevalue desde la
    -- diferencia de area. Forzamos 'pendiente' y disparamos el recalculo.
    update parcela_poligonos
      set estado_validacion = 'pendiente',
          validado_por      = null,
          fecha_validacion  = null
    where id = p_poligono_id
    returning * into v_row;
  end if;

  if v_row.id is null then
    raise exception 'Poligono % no encontrado o sin acceso', p_poligono_id;
  end if;

  return json_build_object(
    'id', v_row.id,
    'estado_validacion', v_row.estado_validacion
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Permisos de ejecucion para usuarios autenticados.
-- ----------------------------------------------------------------------------
grant execute on function get_parcelas_geo()            to authenticated;
grant execute on function get_parcela_polygons()        to authenticated;
grant execute on function upsert_parcela_poligono(uuid, json, text, boolean, metodo_levantamiento) to authenticated;
grant execute on function validar_poligono(uuid, boolean) to authenticated;
