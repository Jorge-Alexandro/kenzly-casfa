-- ============================================================================
-- Fix: maquila_recalc() se llamaba a sí misma hasta reventar la pila.
-- ----------------------------------------------------------------------------
-- El trigger trg_maquila_resultado_recalc corre AFTER INSERT/UPDATE/DELETE
-- sobre maquila_resultado y llamaba a maquila_recalc(), que además de sumar los
-- totales en `maquilas` hacía un UPDATE sobre maquila_resultado (para escribir
-- rend_real). Ese UPDATE volvía a disparar el mismo trigger:
--
--   insert maquila_resultado → trigger → recalc → update maquila_resultado
--     → trigger → recalc → update … → "stack depth limit exceeded"
--
-- Resultado: se insertaban las cabeceras de los cortes pero NINGÚN renglón de
-- producto. Se detectó al cargar los 8 formatos reales de la cosecha 2026.
--
-- Arreglo: el trigger vuelve a la regla que ya sigue acopio_recalc_entrada —
-- PURA agregación sobre la tabla padre, sin tocar la tabla que lo disparó.
-- rend_real (el % de cada producto sobre el oro total del corte) lo escribe la
-- app al insertar, igual que las derivadas de `pesadas` las escribe calculo.mjs.
--
-- Ejecutar después de 0023.
-- ============================================================================

create or replace function maquila_recalc(p_maquila uuid) returns void as $$
begin
  update maquilas m set
    kg_salida    = coalesce(s.kg, 0),
    qq_salida    = coalesce(s.qq, 0),
    sacos_salida = coalesce(s.sacos, 0),
    rendimiento  = case when m.kg_entrada > 0
                        then coalesce(s.kg, 0) / m.kg_entrada end,
    updated_at   = now()
  from (
    select sum(total_kg) as kg, sum(quintales) as qq, sum(sacos) as sacos
      from maquila_resultado where maquila_id = p_maquila
  ) s
  where m.id = p_maquila;
end $$ language plpgsql;
