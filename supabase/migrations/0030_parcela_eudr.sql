-- ============================================================================
-- Kenzly CASFA — Tamizado EUDR interno (2020 vs actual) por parcela
-- ----------------------------------------------------------------------------
-- MAYACERT rechaza parcelas comparando la cobertura contra el bosque 2020 de la
-- UE y detectando remoción de cobertura arbórea posterior al 31-dic-2020
-- (análisis multitemporal Sentinel-2). Aquí replicamos un TAMIZADO propio:
-- comparamos el NDVI de referencia de 2020 contra el actual y detectamos un
-- posible evento de despeje (caída profunda) posterior a 2020, para que CASFA
-- identifique casos de riesgo ANTES de mandarlos a certificar.
--
-- NO sustituye el veredicto oficial (que usa la capa forestal 2020 de la UE);
-- es una alerta temprana basada en NDVI.
-- Ejecutar después de 0029.
-- ============================================================================

create table if not exists parcela_eudr (
  parcela_id     uuid primary key references parcelas(id) on delete cascade,
  org_id         uuid not null references organizaciones(id) on delete cascade,
  -- VEREDICTO OFICIAL (de la verificadora, p.ej. MAYACERT). Es la autoridad.
  estatus_oficial text check (estatus_oficial in ('verificada','deforestacion')),
  fuente         text,           -- 'MAYACERT 2026'
  fecha_oficial  date,
  -- MONITOREO INTERNO por NDVI (alerta temprana, NO sustituye lo oficial).
  ndvi_2020      numeric(6,4),   -- NDVI de referencia (pico) en 2020
  ndvi_actual    numeric(6,4),   -- NDVI de referencia (pico) últimos 12 meses
  delta          numeric(6,4),   -- ndvi_actual - ndvi_2020
  min_post2020   numeric(6,4),   -- NDVI mínimo detectado después de 2020
  fecha_min      date,           -- cuándo ocurrió ese mínimo (posible despeje)
  imagenes       int default 0,  -- nº de imágenes despejadas usadas
  clasificacion  text check (clasificacion in
                   ('sin_cambio','vigilar','posible_perdida','sin_datos')),
  analizado_en   timestamptz
);
create index if not exists parcela_eudr_org_idx on parcela_eudr (org_id, clasificacion);

alter table parcela_eudr enable row level security;
drop policy if exists org_read on parcela_eudr;
create policy org_read on parcela_eudr for select using (es_miembro(org_id));
drop policy if exists org_write on parcela_eudr;
create policy org_write on parcela_eudr for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on parcela_eudr to authenticated;

notify pgrst, 'reload schema';
