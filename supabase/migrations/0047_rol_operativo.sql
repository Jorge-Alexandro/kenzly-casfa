-- ============================================================================
-- Kenzly CASFA — Rol OPERATIVO (bodega / acopio)
-- ----------------------------------------------------------------------------
-- Axel trabaja el acopio y las salidas de bodega, pero NO debe ver ni capturar
-- dinero. Los roles que había no sirven:
--   · inspector/coordinador → es el set del SIC (fichas, GeoSIC, certificación),
--     que no tiene nada que ver con bodega.
--   · contador              → justamente el que SÍ ve precios.
--   · solo_lectura          → no podría capturar entradas de acopio.
--
-- El rol nuevo entra al set operativo (Acopio + Salidas) y queda FUERA de
-- es_contador(), que es la función que protege salida_venta y entrada_costo.
-- Por eso el bloqueo del dinero no depende de la interfaz: la RLS le niega
-- hasta la lectura de la tabla de precios.
--
-- `rol` es el enum rol_membresia; Postgres no deja usar un valor nuevo del enum
-- en la misma transacción en que se agrega, así que este archivo solo lo agrega.
--
-- Ejecutar después de 0046.
-- ============================================================================

alter type rol_membresia add value if not exists 'operativo';

notify pgrst, 'reload schema';
