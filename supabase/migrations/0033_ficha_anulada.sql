-- ============================================================================
-- Kenzly CASFA — Anulación de fichas de inspección
-- ----------------------------------------------------------------------------
-- Una ficha es el expediente que sustenta la certificación ante MAYACERT. Si se
-- borra, queda un hueco que nadie puede explicar en auditoría: no se sabe si la
-- inspección no ocurrió, si se perdió, o si alguien la quitó.
--
-- Por eso el camino normal es ANULAR, no borrar: la ficha se queda con su
-- motivo, quién la anuló y cuándo. El borrado real se reserva para borradores
-- sin valor probatorio (duplicados, pruebas) y solo lo hace un admin.
--
-- Ejecutar después de 0032.
-- ============================================================================

-- El valor nuevo va primero y NO se usa en esta misma migración: Postgres
-- prohíbe usar un valor de enum recién agregado dentro de la misma transacción.
alter type estado_ficha add value if not exists 'anulada';

alter table fichas
  add column if not exists anulada_motivo text,
  add column if not exists anulada_por    uuid references usuarios(id),
  add column if not exists anulada_en     timestamptz;

comment on column fichas.anulada_motivo is
  'Por qué se anuló. Obligatorio al anular: sin motivo la anulación es tan opaca como un borrado.';

-- Recarga el cache de PostgREST para que vea las columnas nuevas de inmediato.
notify pgrst, 'reload schema';
