-- ============================================================================
-- Kenzly CASFA — Traslape con bosque 2020 de la UE (JRC GFC2020 v3) por parcela
-- ----------------------------------------------------------------------------
-- Replica el paso geoespacial de MAYACERT: % del polígono que caía sobre bosque
-- en 2020. Cualquier traslape = riesgo potencial EUDR. Alimenta el tamizado
-- propio para detectar casos ANTES de mandarlos a certificar.
-- Ejecutar después de 0030.
-- ============================================================================

alter table parcela_eudr
  add column if not exists bosque2020_pct numeric(5,1),
  add column if not exists bosque2020_en  timestamptz;

notify pgrst, 'reload schema';
