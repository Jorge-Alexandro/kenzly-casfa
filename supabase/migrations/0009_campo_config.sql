-- ============================================================================
-- Kenzly CASFA — Motor de fichas: campo `config` (JSONB) por campo
-- ----------------------------------------------------------------------------
-- Habilita capacidades nuevas pedidas por el SIC sin cambiar el espinazo:
--   - condicion:   { campo, igual }   -> el campo solo se muestra si otro campo
--                                         tiene cierto valor (preguntas condicionales)
--   - columnas:    [ {id,label,tipo,formula?} ]  -> campo tipo 'tabla' (filas
--                                         repetibles; p.ej. variedades con marco
--                                         de plantacion A×B y densidad calculada)
--   - autofill:    'produccion_anterior' | 'produccion_actual' | ...  -> el valor
--                                         se jala de la parcela seleccionada
--   - opcion_otro: true  -> enum que, al elegir "Otro", muestra texto libre
-- Ejecutar despues de 0008.
-- ============================================================================

alter table form_campos
  add column if not exists config jsonb not null default '{}'::jsonb;
