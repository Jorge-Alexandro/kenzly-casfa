-- ============================================================================
-- Kenzly CASFA — Captura nativa de cortes de maquila (Fase 1)
-- ----------------------------------------------------------------------------
-- Hasta ahora un corte SOLO entraba importando el Excel que llenan a mano en
-- el beneficio. Esto agrega lo que falta para capturarlo directo en la app:
--
--   · Firmas en pantalla de las 4 personas que el formato ya pedía (elaboró,
--     entregó, retrillero, calador) — mismo patrón que entradas.firma_*_url:
--     un data URI guardado tal cual, sin bucket de Storage.
--   · `capturado_por`: quién lo dio de alta desde la app (los importados por
--     Excel se distinguen porque ya tienen origen_archivo).
--
-- No se toca nada de lo que ya existe: el importador de Excel sigue
-- funcionando igual, para históricos y como respaldo.
--
-- Ejecutar después de 0047.
-- ============================================================================

alter table maquilas
  add column if not exists firma_elaboro_url    text,
  add column if not exists firma_entrego_url    text,
  add column if not exists firma_retrillero_url text,
  add column if not exists firma_calador_url    text,
  add column if not exists capturado_por        uuid references usuarios(id) on delete set null;

comment on column maquilas.capturado_por is
  'Quién dio de alta el corte desde la app (captura nativa). NULL en los importados por Excel.';

-- ----------------------------------------------------------------------------
-- OJO — una boleta NO siempre va completa a un solo corte. La boleta 302
-- (COMERCIALIZADORA VITAL DE LA SIERRA, 227 sacos / 11,965.4 kg) se repartió
-- entre M-17 (127 sacos / 7,176.9 kg) y M-18 (100 sacos / 4,788.5 kg) — una
-- entrega comercial grande, procesada en dos días. Por eso NO se agrega un
-- índice único (entrada_id, org_id): rompería ese caso real. El límite correcto
-- es "la suma de lo usado en todos los cortes no puede pasar de lo que hay en
-- la boleta", y eso lo valida la API al crear el corte (lib/maquila/captura.ts),
-- no un constraint de fila.
-- ----------------------------------------------------------------------------

notify pgrst, 'reload schema';
