-- ============================================================================
-- Kenzly CASFA — Concentrado de acopio (Francisco)
-- ----------------------------------------------------------------------------
-- Francisco arma a mano "2026 ACOPIO ABR REPORTE BOLETAS.xlsx": el concentrado
-- de boletas, el pivote de QQ acopiados por mes y tipo de café, y el reparto de
-- QQ por cooperativa (con su equivalente en lotes de 418.40 qq).
--
-- Lo único que le falta al sistema para armarlo solo es saber si un proveedor es
-- una SOCIEDAD (persona moral = cooperativa) o un socio individual (persona
-- física). Eso es esta migración.
--
-- Por qué importa: en su Excel el reparto por cooperativa se calcula con
--   =SUMIF(MATRIZ[PROVEEDOR]; "<nombre de la lista>"; MATRIZ[QQ])
-- o sea, comparando el nombre LETRA POR LETRA contra una lista escrita aparte.
-- Cuando el nombre del proveedor en la boleta no coincide exactamente con esa
-- lista ("PRODUCTORES DE CAFE DE MOTOZINTLA" vs "PRODUCTORES DE CAFE
-- MOTOZINTLA"), el SUMIF devuelve 0 y esa cooperativa desaparece del reporte.
-- Marcando el tipo en el catálogo, el reparto ya no depende de que dos textos
-- coincidan.
--
-- Ejecutar después de 0040.
-- ============================================================================

alter table acopio_proveedor
  add column if not exists tipo_persona text not null default 'fisica'
    check (tipo_persona in ('moral', 'fisica'));

comment on column acopio_proveedor.tipo_persona is
  'moral = sociedad/cooperativa (agrupa en el reporte por cooperativa); fisica = socio individual (suma en "CASFA socios individuales").';

create index if not exists acopio_proveedor_tipo_idx on acopio_proveedor (org_id, tipo_persona);

-- ----------------------------------------------------------------------------
-- Los dos proveedores que entraron con las boletas 318/319 y que aún no estaban
-- en el catálogo (ambos personas físicas).
-- ----------------------------------------------------------------------------
do $$
declare o uuid;
begin
  select id into o from organizaciones where slug = 'casfa';
  if o is null then return; end if;

  insert into acopio_proveedor (org_id, nombre, comunidad, municipio, tipo_persona)
  select o, 'SABITA SILVIA RODRIGUEZ RODRIGUEZ', 'SANTO DOMINGO', 'UNION JUAREZ', 'fisica'
  where not exists (
    select 1 from acopio_proveedor where org_id = o and upper(nombre) = 'SABITA SILVIA RODRIGUEZ RODRIGUEZ'
  );

  insert into acopio_proveedor (org_id, nombre, comunidad, municipio, tipo_persona)
  select o, 'MARTIN MENDOZA SANTIAGO', 'AMPLIACION PROGRESO', 'HUIXTLA', 'fisica'
  where not exists (
    select 1 from acopio_proveedor where org_id = o and upper(nombre) = 'MARTIN MENDOZA SANTIAGO'
  );
end $$;

-- ----------------------------------------------------------------------------
-- Marca como persona moral a las sociedades. La lista sale de los proveedores
-- que el propio Francisco clasificó como PERSONA MORAL en su concentrado, más
-- los que aparecen con la misma forma jurídica en el padrón de acopio.
-- Se compara sin acentos ni signos para que las variantes de escritura entren.
-- ----------------------------------------------------------------------------
update acopio_proveedor
set tipo_persona = 'moral'
where tipo_persona <> 'moral'
  and (
       upper(nombre) like '%SOCIEDAD%'
    or upper(nombre) like '%COOPERATIVA%'
    or upper(nombre) like '%S.P.R%'
    or upper(nombre) like '%SPR %'
    or upper(nombre) like '%S DE SS%'
    or upper(nombre) like '%SC DE RL%'
    or upper(nombre) like '%DE C.V%'
    or upper(nombre) like '%DE CV%'
    or upper(nombre) like '%UNION DE%'
    or upper(nombre) like '%COMERCIALIZADORA%'
    or upper(nombre) like '%PRODUCTORES DE%'
    or upper(nombre) like '%PRODUCTORES ECOLOGICOS%'
    or upper(nombre) like '%CAFECES DE LA SIERRA%'
    or upper(nombre) like '%SEMVAC%'
    or upper(nombre) like '%ANEPAAN%'
    or upper(nombre) like '%GRUPO VITAL%'
    or upper(nombre) like '%BUEN SAMARITANO%'
    or upper(nombre) like '%LA FRATERNIDAD%'
    or upper(nombre) like '%OTILIO MONTA%'
    or upper(nombre) like '%CAFE GORCA%'
  );

notify pgrst, 'reload schema';
