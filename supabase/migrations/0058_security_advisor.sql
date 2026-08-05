-- ============================================================================
-- Kenzly CASFA — Remediación del Security Advisor de Supabase
-- ----------------------------------------------------------------------------
-- Cuatro hallazgos reales, no ruido:
--
-- 1) "Function Search Path Mutable" (WARN, ~45 funciones): ninguna función de
--    public fija search_path — vulnerable a secuestro de search_path. Se fija
--    en TODAS sin excepción (dinámico, vía pg_proc — no depende de listar a
--    mano cada nombre). No cambia ningún comportamiento.
--
-- 2) "Public Can Execute SECURITY DEFINER Function" (WARN): funciones
--    SECURITY DEFINER (saltan RLS a propósito — helpers de RLS como
--    es_miembro, o triggers como entrada_pago_touch) NO deben ser invocables
--    directo vía /rest/v1/rpc/<fn> por cualquiera, ni siquiera anon. Se
--    revoca PUBLIC de TODA función SECURITY DEFINER de public, y se re-otorga
--    a authenticated SÓLO lo que la app de verdad llama (ver grep de
--    `.rpc(` en src/) o lo que usan las políticas RLS evaluadas como
--    authenticated (es_miembro/es_contador/es_editor_comercial).
--    Los triggers (entrada_pago_touch, ventas_stock_descontar, los
--    *_asignar_folio, etc.) NO necesitan que el rol que dispara el DML tenga
--    EXECUTE sobre la función — eso no es cómo Postgres dispara triggers —
--    así que quedan sin grant a propósito, y se verifica en vivo que
--    sigan funcionando después de correr esto.
--
-- 3) "Security Definer View" (ERROR, 4 vistas): sin security_invoker, una
--    vista corre con los permisos del DUEÑO (salta RLS) en vez de los de
--    quien consulta. v_maquila_master y v_remision_cuadre se leen en la app
--    SIN filtro de org_id (confiaban en que RLS filtrara) — hoy con una sola
--    organización real (casfa) no se nota, pero cualquier segunda
--    organización vería las filas de TODAS. Grave para el modelo
--    multi-tenant. Fix: security_invoker = true (Postgres 15+, Supabase ya
--    corre en 15+) — la vista pasa a respetar el RLS de quien pregunta.
--
-- 4) "Public Bucket Allows Listing" (WARN): la política de storage.objects
--    del bucket geosic no traía "to authenticated" — cualquiera SIN sesión
--    podía enumerar TODOS los archivos (fotos de talleres, KMZ de parcelas).
--    Esto NO afecta las URLs públicas ya generadas (getPublicUrl sirve por
--    /object/public/, que no pasa por esta política de storage.objects) —
--    sólo cierra la posibilidad de listar/enumerar sin sesión.
--
-- Ejecutar después de 0057.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) search_path fijo en TODAS las funciones de public que no lo tengan.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
        where cfg like 'search_path=%'
      )
  loop
    execute format('alter function public.%I(%s) set search_path = public, pg_temp', r.proname, r.args);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Revocar PUBLIC (incluye anon) de toda función SECURITY DEFINER, luego
--    re-otorgar a authenticated sólo lo que la app llama directo o usan las
--    políticas RLS.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef = true
  loop
    -- "from public" quita el default implícito; Supabase ADEMÁS otorga
    -- EXECUTE a anon/authenticated de forma EXPLÍCITA al crear cada función
    -- (vía ALTER DEFAULT PRIVILEGES de su plantilla de proyecto) — sin las
    -- dos líneas de abajo, ese grant directo sobrevive al revoke de public.
    execute format('revoke all on function public.%I(%s) from public', r.proname, r.args);
    execute format('revoke all on function public.%I(%s) from anon', r.proname, r.args);
    execute format('revoke all on function public.%I(%s) from authenticated', r.proname, r.args);
  end loop;
end $$;

do $$
declare r record;
  nombres text[] := array[
    'es_miembro', 'es_contador', 'es_editor_comercial', 'crm_miembros_org',
    'get_parcelas_geo', 'get_parcela_polygons', 'upsert_parcela_poligono', 'validar_poligono',
    'get_productores_dashboard', 'get_parcelas_satelite', 'get_indices_historial',
    'upsert_indice_satelital', 'get_poligonos_satelite'
  ];
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(nombres)
  loop
    execute format('grant execute on function public.%I(%s) to authenticated', r.proname, r.args);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Vistas: que respeten el RLS de quien consulta, no del dueño.
-- ---------------------------------------------------------------------------
alter view v_indicadores_geo set (security_invoker = true);
alter view v_parcelas_sin_poligono set (security_invoker = true);
alter view v_maquila_master set (security_invoker = true);
alter view v_remision_cuadre set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 4) Bucket geosic: cerrar el listado sin sesión (no afecta URLs públicas).
-- ---------------------------------------------------------------------------
drop policy if exists geosic_read on storage.objects;
create policy geosic_read on storage.objects
  for select to authenticated using (bucket_id = 'geosic');

notify pgrst, 'reload schema';
