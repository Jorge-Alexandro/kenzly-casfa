-- ============================================================================
-- Contratos: firma remota del vendedor por liga
-- ----------------------------------------------------------------------------
-- El vendedor no siempre está presente para firmar en la oficina. Con esto se
-- genera una LIGA con un token único (UUID no adivinable) que se le comparte
-- (WhatsApp, correo); él la abre en su celular, ve el contrato y firma. La liga
-- da acceso SÓLO a ese contrato y sólo para firmar como vendedor.
--
-- El token es una capacidad tipo "bearer": quien tiene la liga puede firmar.
-- Es el patrón estándar de firma electrónica por enlace. Se puede revocar
-- poniendo el token en null (se genera uno nuevo).
--
-- Ejecutar después de 0034.
-- ============================================================================

alter table contrato_fijacion
  add column if not exists firma_token uuid;

-- Un token apunta a un solo contrato.
create unique index if not exists contrato_firma_token_idx
  on contrato_fijacion (firma_token)
  where firma_token is not null;

comment on column contrato_fijacion.firma_token is
  'Token de la liga de firma remota del vendedor. null = sin liga activa.';

notify pgrst, 'reload schema';
