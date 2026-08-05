-- ============================================================================
-- Kenzly CASFA — Corrige una regresión de 0058_security_advisor.sql
-- ----------------------------------------------------------------------------
-- 0058 fijó `search_path = public, pg_temp` en toda función que no tuviera uno
-- explícito. Pero PostGIS vive en el esquema `extensions` de este proyecto
-- (no en `public`), así que cualquier función que llame ST_AsGeoJSON,
-- ST_Area, etc. sin calificar quedó rota: "function st_asgeojson(...) does
-- not exist" — reventó /geosic, /satelite y las fichas con polígono en
-- producción. Fix: agregar `extensions` al search_path fijado por 0058.
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
        where cfg = 'search_path=public, pg_temp'
      )
  loop
    execute format('alter function public.%I(%s) set search_path = public, extensions, pg_temp', r.proname, r.args);
  end loop;
end $$;

notify pgrst, 'reload schema';
