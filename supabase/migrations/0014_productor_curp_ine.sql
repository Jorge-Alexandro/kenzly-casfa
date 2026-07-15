-- ============================================================================
-- Kenzly CASFA — Padrón: CURP e identificación (INE) del productor
-- ----------------------------------------------------------------------------
-- El LPA (entregable MAYACERT) lleva CURP e ID INE por productor. No estaban en
-- la base; se agregan aquí y se pueblan con scripts/import-lpa.py desde los LPA.
-- Las coordenadas del LPA NO necesitan columna: salen del centroide del polígono
-- activo en parcela_poligonos (centroide_lat/lng, que ya calcula su trigger).
-- Ejecutar después de 0013.
-- ============================================================================

alter table productores
  add column if not exists curp text,
  add column if not exists ine  text;   -- número de identificación (credencial INE)
