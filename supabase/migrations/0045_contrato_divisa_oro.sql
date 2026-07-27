-- ============================================================================
-- Kenzly CASFA — Divisa por tipo de café en los contratos de fijación
-- ----------------------------------------------------------------------------
-- Los 4 tipos de café del acopio se pactan en su moneda propia: el café ORO es
-- de exportación y se cotiza en dólares (arbitraje "Contrato C" de Nueva York),
-- mientras el cereza y el pergamino se compran en el país, en pesos. La semilla
-- original (0027) dejó todo en MXN; aquí se corrige el oro a USD.
--
-- En el alta del contrato la divisa sigue siendo editable: esto solo fija el
-- valor por defecto correcto de cada tipo.
--
-- Ejecutar después de 0044.
-- ============================================================================

update contrato_plantilla
   set moneda = 'USD'
 where tipo = 'ORO'
   and moneda <> 'USD';

notify pgrst, 'reload schema';
