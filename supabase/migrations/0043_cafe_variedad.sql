-- ============================================================================
-- Kenzly CASFA — Separar el padrón de café en ROBUSTA y ÁRABE
-- ----------------------------------------------------------------------------
-- Hasta ahora todo el café era un solo bucket (tipo_productor = 'cafe'). El SIC
-- lleva tres padrones distintos: robusta, árabe y tropicales, cada uno en su
-- propio archivo LPA. tipo_productor ya separa café de tropical; falta separar
-- robusta de árabe DENTRO del café, para que al levantar una ficha de robusta
-- solo salgan los robusteros y en una de árabe solo los de árabe.
--
-- Se agrega una columna en vez de partir el enum tipo_cultivo: es menos
-- invasivo y no toca el resto del sistema (GeoSIC, acopio, etc.).
--
-- Ejecutar después de 0042.
-- ============================================================================

alter table productores
  add column if not exists cafe_variedad text
    check (cafe_variedad in ('robusta', 'arabe'));

comment on column productores.cafe_variedad is
  'Solo para tipo_productor = cafe: robusta | arabe. NULL en tropicales.';

-- Los productores de café que ya existen vienen del padrón de robusta
-- (Finca Chula Vista): se marcan como robusta. El padrón de árabe se importa
-- aparte con scripts/import-padron-arabe.mjs, marcando cafe_variedad = 'arabe'.
update productores
   set cafe_variedad = 'robusta'
 where tipo_productor = 'cafe'
   and cafe_variedad is null;

notify pgrst, 'reload schema';
