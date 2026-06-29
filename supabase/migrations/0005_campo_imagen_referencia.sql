-- ============================================================================
-- Kenzly GeoOps — Imagen de referencia por campo de formulario
-- ----------------------------------------------------------------------------
-- Permite adjuntar una imagen-guia fija a cualquier campo (p.ej. un diagrama de
-- tipos/densidad de sombra junto a "Tipo de sombra"). Es configuracion por
-- organizacion: el inspector la ve como referencia mientras responde.
-- Ejecutar despues de 0004.
-- ============================================================================

alter table form_campos
  add column if not exists imagen_referencia_url text;
