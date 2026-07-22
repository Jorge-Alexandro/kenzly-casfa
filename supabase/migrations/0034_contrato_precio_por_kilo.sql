-- ============================================================================
-- Contratos de fijación: el precio se pacta POR KILO
-- ----------------------------------------------------------------------------
-- El contrato se firmaba con `cantidad` en quintales y `precio_unitario` por
-- quintal. En la práctica CASFA pacta el precio POR KILO, aunque el volumen se
-- habla en quintales (sacos). Las dos cifras tienen que estar en el papel: el
-- productor entiende quintales, el pago se hace por kilo.
--
-- Modelo (sin romper nada de lo ya guardado):
--   cantidad        = KILOS pactados        (unidad pasa a 'kg')
--   precio_unitario = precio por KILO
--   importe         = cantidad × precio_unitario   ← la columna generada YA hace
--                     justo esta cuenta, así que no se toca.
--   quintales       = el mismo volumen en quintales (sacos)   ← columna nueva
--   factor_quintal  = kg por quintal del producto al firmar   ← columna nueva
--
-- Se guarda el FACTOR usado (57.5 pergamino, 45.35 oro, 80 cerezo) como
-- snapshot: si mañana cambia el catálogo, un contrato ya firmado debe seguir
-- mostrando la equivalencia con la que se firmó.
--
--   kilos = quintales × factor_quintal
--   precio por quintal = precio por kilo × factor_quintal
--
-- Ejecutar después de 0033.
-- ============================================================================

alter table contrato_fijacion
  add column if not exists quintales      numeric(14,3),
  add column if not exists factor_quintal numeric(8,3);

comment on column contrato_fijacion.cantidad is
  'Kilos pactados (la unidad la dice `unidad`, hoy kg).';
comment on column contrato_fijacion.precio_unitario is
  'Precio por kilo. El importe = cantidad × precio_unitario (columna generada).';
comment on column contrato_fijacion.quintales is
  'El mismo volumen expresado en quintales (sacos), para el papel.';
comment on column contrato_fijacion.factor_quintal is
  'Kg por quintal usado al firmar (snapshot de acopio_producto).';

-- Los contratos nuevos se capturan en kilos.
alter table contrato_fijacion alter column unidad set default 'kg';

-- La plantilla también deja de sugerir quintal: el precio se pacta por kilo.
alter table contrato_plantilla alter column unidad set default 'kg';
update contrato_plantilla set unidad = 'kg' where unidad = 'quintal';

-- El factor de quintal vive en acopio_producto (misma autoridad que el acopio y
-- el LPA). Se copia a la plantilla para no cruzar módulos al capturar.
alter table contrato_plantilla
  add column if not exists factor_quintal numeric(8,3);

update contrato_plantilla p
   set factor_quintal = a.factor_quintal
  from acopio_producto a
 where a.org_id = p.org_id
   and a.especie = p.especie
   and a.tipo = p.tipo;

notify pgrst, 'reload schema';
