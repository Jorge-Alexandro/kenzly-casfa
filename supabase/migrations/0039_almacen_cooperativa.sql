-- ============================================================================
-- Kenzly CASFA — Dos almacenes: CASFASA (principal) y la cooperativa FLO
-- (Finca Chula Vista).
-- ----------------------------------------------------------------------------
-- CASFA acopia café de la cooperativa FLO (comunidad = "Chula Vista"), pero ESE
-- café NO lo paga CASFA: es de la cooperativa. Sólo se paga lo que un productor
-- entrega POR ENCIMA de su estimación de cosecha (LPA) — ese excedente lo compra
-- el almacén principal (CASFASA).
--
--   Ejemplo: estima 2 000 kg y entrega 2 500  ->  2 000 kg cooperativa (no se
--   pagan) + 500 kg CASFASA (se pagan).  El excedente puede caer a media boleta.
--
-- El reparto (cuánto de cada boleta es cooperativa y cuánto CASFASA) lo CALCULA
-- la app recorriendo las entregas del productor en orden de fecha y llenando la
-- cubeta de la cooperativa hasta su estimación (suma de estimacion_cosecha del
-- ciclo). Aquí sólo se agrega el AJUSTE MANUAL: si la estimación del LPA está
-- desfasada, Contabilidad puede fijar a mano los kg pagables de una boleta.
--
--   kg_pagable NULL  -> usar el cálculo automático (excedente sobre estimación)
--   kg_pagable = n   -> forzar n kilos pagables (CASFASA) en esa boleta
--
-- El importe (precio_kg × kg pagables) lo recalcula el servidor; sigue viviendo
-- en entrada_costo, oculto al operativo por la RLS de 0036.
--
-- Ejecutar después de 0038.
-- ============================================================================

alter table entrada_costo
  add column if not exists kg_pagable numeric(12,3);

comment on column entrada_costo.kg_pagable is
  'Ajuste manual de kg a pagar (almacén CASFASA). NULL = usar el reparto automático por estimación LPA. Sólo aplica a boletas de la cooperativa FLO (comunidad Chula Vista).';

notify pgrst, 'reload schema';
