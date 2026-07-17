-- ============================================================================
-- Kenzly CASFA — Alta de productores en campo con GPS (CHESPAL)
-- ----------------------------------------------------------------------------
-- El SIC da de alta productores nuevos durante las visitas (p.ej. CR015093 a
-- CR015100 del LPA 2026-2027) y captura la ubicación con el GPS del teléfono.
-- Guardamos el punto directamente en el productor; los polígonos de sus
-- parcelas llegan después por GeoSIC.
-- Ejecutar después de 0027.
-- ============================================================================

alter table productores
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists gps_precision_m numeric(8,1);

notify pgrst, 'reload schema';
