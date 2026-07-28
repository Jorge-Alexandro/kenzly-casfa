-- ============================================================================
-- Kenzly CASFA — Permite borrar versiones de polígono (GeoSIC)
-- ----------------------------------------------------------------------------
-- parcela_poligonos se creó antes de que este repo llevara el historial de
-- migraciones, así que no sabemos con certeza si su política de RLS ya cubre
-- DELETE (las que sí se rastrean en el repo usan "for all", pero esta tabla es
-- de las que no). Se agrega una política explícita para DELETE, idempotente:
-- si ya existía una que lo permitía, esta simplemente no cambia nada (Postgres
-- combina políticas permisivas del mismo comando con OR).
--
-- El control de QUIÉN puede borrar (solo admin) vive en la API
-- (/api/geosic/eliminar-poligono), igual que aprobar/rechazar; aquí solo se
-- garantiza que un miembro de la organización pueda hacerlo a nivel de fila.
--
-- Ejecutar después de 0045.
-- ============================================================================

drop policy if exists poligono_delete on parcela_poligonos;
create policy poligono_delete on parcela_poligonos
  for delete using (es_miembro(org_id));

notify pgrst, 'reload schema';
