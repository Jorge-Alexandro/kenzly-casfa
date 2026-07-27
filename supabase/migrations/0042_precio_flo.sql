-- ============================================================================
-- Kenzly CASFA — Dos precios en la misma boleta de la cooperativa FLO
-- ----------------------------------------------------------------------------
-- Caso B290 (Efrén Santiz): una boleta de Chula Vista que se parte entre los dos
-- almacenes puede pagarse con DOS precios distintos —uno para la parte de la
-- cooperativa (FLO) y otro para el excedente que compra CASFASA.
--
--   entrada_costo.precio_kg        -> precio del EXCEDENTE (CASFASA), el que ya existía
--   entrada_costo.precio_kg_coop   -> precio de la parte de la COOPERATIVA (FLO)
--
--   importe = precio_kg      × kg_casfasa (excedente)
--           + precio_kg_coop × kg_coop    (cooperativa)
--
-- Si precio_kg_coop es NULL, la parte de la cooperativa no se paga (0), que es
-- justo como venía trabajando: sólo cambia si Contabilidad captura ese precio.
-- Sólo aplica a boletas de la cooperativa FLO (comunidad Chula Vista).
--
-- Ejecutar después de 0041.
-- ============================================================================

alter table entrada_costo
  add column if not exists precio_kg_coop numeric(12,4);

comment on column entrada_costo.precio_kg_coop is
  'Precio por kilo de la parte de la cooperativa FLO (kg dentro de la estimación). NULL = esa parte no se paga. precio_kg es el precio del excedente (CASFASA). Sólo boletas de Chula Vista.';

notify pgrst, 'reload schema';
