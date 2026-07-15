-- ============================================================================
-- Ajuste de maquila_salida a lo que la hoja SALIDA realmente contiene.
-- ----------------------------------------------------------------------------
-- 0023 modeló las salidas asumiendo que todas eran embarques de exportación.
-- Al leer las 143 filas reales resultó que la hoja mezcla DOS cosas distintas
-- bajo el mismo encabezado, y tres supuestos no aguantan:
--
--   1. `sacos int` → las salidas nacionales tienen sacos FRACCIONARIOS
--      (0.72, 41.74, 0.03): no son costales, son saldos pesados a granel.
--   2. `unique (org_id, guia)` → sólo las exportaciones tienen guía
--      ('26/CAS-01'). Las nacionales traen un folio numérico que SE REPITE:
--      el folio 22 sale dos veces el mismo día, con productos distintos.
--   3. La columna 'TRANSPORTE' guarda al transportista en las exportaciones
--      (CASTORES) pero el CANAL en las nacionales (VENTAS/OFICINA,
--      VENTAS/BENEFICIO, TORREFACCION). Son dos campos, no uno.
--
-- Por eso `tipo_salida`:
--   'exportacion' (59 filas) → guía, lote, lote OIC, transporte, placas → LAREDO TX
--   'nacional'    (84 filas) → folio, canal, destino Tapachula o Torrefacción
--
-- Ejecutar después de 0024.
-- ============================================================================

do $$ begin
  create type tipo_salida_maquila as enum ('exportacion', 'nacional');
exception when duplicate_object then null; end $$;

-- La guía deja de ser la llave: no todas las filas tienen una.
alter table maquila_salida drop constraint if exists maquila_salida_org_id_guia_key;

alter table maquila_salida
  add column if not exists tipo_salida tipo_salida_maquila not null default 'exportacion',
  add column if not exists folio       int,      -- el consecutivo de las nacionales
  add column if not exists canal       text,     -- VENTAS/OFICINA | VENTAS/BENEFICIO | TORREFACCION
  add column if not exists producto_texto text;  -- 'SEGUNDA/ARABE' tal cual viene

-- Sacos fraccionarios: un saldo de 0.72 sacos es real y hay que poder guardarlo.
alter table maquila_salida
  alter column sacos type numeric(12,2) using sacos::numeric;

-- La guía sigue siendo única, pero SÓLO donde existe (las exportaciones).
create unique index if not exists maquila_salida_guia_idx
  on maquila_salida (org_id, guia) where guia is not null;

create index if not exists maquila_salida_tipo_idx on maquila_salida (org_id, tipo_salida);

comment on column maquila_salida.sacos is
  'Numérico, no entero: las salidas nacionales registran saldos fraccionarios de saco.';
comment on column maquila_salida.canal is
  'Sólo nacionales. En exportación el equivalente es `transporte` (la paquetera).';
