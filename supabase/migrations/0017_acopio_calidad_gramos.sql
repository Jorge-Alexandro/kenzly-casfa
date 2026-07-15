-- ============================================================================
-- Kenzly CASFA — Acopio: análisis de calidad CAPTURADO EN GRAMOS
-- ----------------------------------------------------------------------------
-- Hasta ahora el capturista tecleaba los porcentajes ya calculados. El manual de
-- CASFA (Doc R.3 "Procedimiento para Muestreo y Acopio") dice que el almacenista
-- NO calcula porcentajes: pesa gramos en la báscula y la tabla hace el resto.
-- Esta migración mueve la app al mismo método, guardando los gramos como dato
-- primario y las fracciones como resultado.
--
-- MÉTODO (Doc R.3, secciones 5–9):
--
--  1. Se homogeneízan las muestras de todos los sacos → MUESTRA DE 300 g.
--  2. Rendimiento: esos 300 g pasan por la morteadora; se sacude el polvo y se
--     pesa el café ORO obtenido.  rendimiento = oro_g / 300
--       · Árabe pergamino → mínimo 81 %  (tabla: 252 g = 84 %)
--       · Robusta cereza  → mínimo 60 %  (tabla: 180 g = 60 %)
--       · CAFÉ ORO → NO APLICA (null): no se acopió en pergamino ni en cereza,
--         entró ya trillado, no hay conversión que medir. Sí se le hacen
--         zarandas, mancha y humedad.
--       · CACAO → NO APLICA (null): no lleva análisis de calidad, sólo humedad.
--
--     AppSheet guardaba 1.0 (= 100 %) en esos dos casos y eso MIENTE: dice
--     "rendimiento perfecto" donde no se midió nada. En la base van como null.
--     Los datos lo confirman: los 29 de café oro y los 40 de cacao traen 1.0 sin
--     excepción, y ninguna de las 243 entradas de pergamino/cereza lo trae. Y
--     ninguna de las 40 de cacao tiene una sola zaranda ni mancha.
--  3. Cerezo (árabe) / granos negros (robusta): se escogen visualmente de la
--     misma muestra de 300 g.  cerezo = cerezo_g / 300  (tolerancia 3 % y 5 %)
--  4. Mancha: sobre 100 g de café ORO ya retrillado se separan los granos con
--     defecto.  mancha = mancha_g / 100  (tolerancia 5 %, máx. 12 %)
--  5. Tamaño: sobre 100 g de café ORO se pasa por zarandas.
--     zaranda_16 = z16_g / 100 (mín. 75 %), zaranda_15 = z15_g / 100 (~25 %),
--     caracol = caracol_g / 100.
--
-- INVARIANTE que confirma el método: zaranda_16 + zaranda_15 + caracol + mancha
-- = 1.0000, porque las cuatro categorías reparten los MISMOS 100 g de oro.
-- Se cumple en 269 de las 272 entradas históricas de CASFA.xlsx (las 3 restantes
-- traen error de dedo: suman 1.005, 1.006 y 1.03).
--
-- Las fracciones (rendimiento, zaranda_16, …) se QUEDAN como están: son la
-- salida. Los gramos son la nueva entrada. El histórico importado de AppSheet
-- llega sólo con fracciones (gramos null) y sigue siendo válido.
--
-- Ejecutar después de 0016.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Gramos de la muestra (entrada primaria del análisis)
-- ----------------------------------------------------------------------------
alter table entradas
  -- Base de la muestra homogeneizada y del análisis sobre oro. Se copian del
  -- catálogo al capturar para que el recibo sea reproducible aunque mañana
  -- CASFA cambie el tamaño de muestra.
  add column if not exists muestra_g      int,          -- típico 300
  add column if not exists analisis_g     int,          -- típico 100

  add column if not exists oro_g          numeric(8,2), -- peso del oro tras trilla
  add column if not exists cerezo_g       numeric(8,2), -- cereza / granos negros
  add column if not exists zaranda_16_g   numeric(8,2),
  add column if not exists zaranda_15_g   numeric(8,2),
  add column if not exists caracol_g      numeric(8,2),
  add column if not exists mancha_g       numeric(8,2),

  -- Cerezo no existía como columna: en AppSheet vivía suelto en los comentarios
  -- ("cerezo(2.96%)"). Es un parámetro con tolerancia propia (3 %), así que va
  -- a su columna como los demás.
  add column if not exists cerezo         numeric(6,4),

  -- El acopiador de AppSheet es un nombre libre ("AXEL ARREVILLAGA"), no un
  -- usuario del sistema; elaborado_por es uuid y no le sirve al histórico.
  add column if not exists elaborado_por_nombre text;

-- ----------------------------------------------------------------------------
-- Costales por máquina (§6). CASFA.xlsx los guarda separados M1/M2; el total
-- (que es lo que usa el cálculo de tara) se queda donde está.
-- ----------------------------------------------------------------------------
alter table pesadas
  add column if not exists m1_plastico int not null default 0,
  add column if not exists m1_yute     int not null default 0,
  add column if not exists m1_henequen int not null default 0,
  add column if not exists m2_plastico int not null default 0,
  add column if not exists m2_yute     int not null default 0,
  add column if not exists m2_henequen int not null default 0;

-- ----------------------------------------------------------------------------
-- Normas de recepción POR PRODUCTO (Doc R.3 §3.1 pergamino y §3.2 robusta).
-- Config como datos, igual que factor_quintal: cada organización pone las suyas
-- y la app sólo avisa cuando la muestra queda fuera de norma.
-- ----------------------------------------------------------------------------
alter table acopio_producto
  add column if not exists analisis_g    int,           -- base del análisis sobre oro
  add column if not exists rend_min      numeric(6,4),  -- rendimiento mínimo
  add column if not exists mancha_max    numeric(6,4),  -- mancha máxima aceptada
  add column if not exists cerezo_max    numeric(6,4),  -- cerezo / negros máximo
  add column if not exists humedad_min   numeric(6,4),
  add column if not exists humedad_max   numeric(6,4),
  add column if not exists zaranda16_min numeric(6,4);

do $$
declare v_org uuid;
begin
  select id into v_org from organizaciones where slug = 'casfa';
  if v_org is null then
    raise notice 'org casfa no encontrada; omito normas de acopio';
    return;
  end if;

  -- ARABE PERGAMINO: rendimiento ≥81 %, mancha ≤12 %, cerezo ≤3 %,
  -- humedad 11.5–12.5 %, zaranda 16 ≥75 %.
  update acopio_producto set
    muestra_g = 300, analisis_g = 100,
    rend_min = 0.81, mancha_max = 0.12, cerezo_max = 0.03,
    humedad_min = 0.115, humedad_max = 0.125, zaranda16_min = 0.75
  where org_id = v_org and especie = 'ARABE' and tipo = 'PERGAMINO';

  -- ROBUSTA CEREZO: rendimiento ≥60 %, mancha ≤16 %, granos negros ≤5 %.
  update acopio_producto set
    muestra_g = 300, analisis_g = 100,
    rend_min = 0.60, mancha_max = 0.16, cerezo_max = 0.05,
    humedad_min = null, humedad_max = 0.125, zaranda16_min = null
  where org_id = v_org and especie = 'ROBUSTA' and tipo = 'CEREZO';

  -- ORO (árabe y robusta): entró ya trillado, NO se acopió en pergamino ni en
  -- cereza → no hay rendimiento que medir (muestra_g null). Sí se le analiza
  -- tamaño, mancha y humedad sobre los 100 g de oro.
  update acopio_producto set
    muestra_g = null, analisis_g = 100,
    rend_min = null, mancha_max = 0.12, cerezo_max = null,
    humedad_max = 0.125
  where org_id = v_org and tipo = 'ORO';

  -- CACAO: no se le hace análisis de calidad. Sólo humedad.
  update acopio_producto set
    muestra_g = null, analisis_g = null,
    rend_min = null, mancha_max = null, cerezo_max = null,
    humedad_max = 0.08
  where org_id = v_org and especie = 'CACAO';
end $$;

notify pgrst, 'reload schema';
