-- ============================================================================
-- Kenzly GeoOps — Modulo 2: Dashboard de productores
-- ----------------------------------------------------------------------------
-- Ejecutar despues de 0003. RPC que agrega por productor: numero de parcelas,
-- hectareas declaradas, cobertura geografica (parcelas con poligono activo y
-- validadas) y estado de inspeccion (numero de fichas + ultima inspeccion).
-- SECURITY INVOKER => RLS por organizacion se aplica sola.
--
-- Usamos subconsultas escalares por metrica (no JOINs en un mismo nivel) para
-- evitar el "fan-out": unir parcelas Y fichas a la vez multiplicaria filas y
-- duplicaria la suma de hectareas.
-- ============================================================================

create or replace function get_productores_dashboard()
returns table (
  id                    uuid,
  codigo                text,
  nombre_completo       text,
  comunidad             text,
  municipio             text,
  tipo_productor        tipo_cultivo,
  num_parcelas          bigint,
  hectareas_totales     numeric,
  parcelas_con_poligono bigint,
  parcelas_validadas    bigint,
  num_fichas            bigint,
  ultima_inspeccion     date
)
language sql
stable
security invoker
as $$
  select
    pr.id,
    pr.codigo,
    pr.nombre_completo,
    pr.comunidad,
    pr.municipio,
    pr.tipo_productor,

    (select count(*) from parcelas p where p.productor_id = pr.id)
      as num_parcelas,

    (select coalesce(sum(p.superficie_declarada_ha), 0)
       from parcelas p where p.productor_id = pr.id)
      as hectareas_totales,

    -- parcelas con poligono activo
    (select count(*)
       from parcelas p
       where p.productor_id = pr.id
         and exists (
           select 1 from parcela_poligonos pp
           where pp.parcela_id = p.id and pp.activo
         ))
      as parcelas_con_poligono,

    -- parcelas cuyo poligono activo esta validado
    (select count(*)
       from parcelas p
       where p.productor_id = pr.id
         and exists (
           select 1 from parcela_poligonos pp
           where pp.parcela_id = p.id and pp.activo
             and pp.estado_validacion = 'validado'
         ))
      as parcelas_validadas,

    (select count(*) from fichas f where f.productor_id = pr.id)
      as num_fichas,

    (select max(f.fecha_inspeccion) from fichas f where f.productor_id = pr.id)
      as ultima_inspeccion

  from productores pr
  order by pr.nombre_completo;
$$;

grant execute on function get_productores_dashboard() to authenticated;
