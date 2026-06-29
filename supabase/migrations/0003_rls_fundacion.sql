-- ============================================================================
-- Kenzly GeoOps — Politicas RLS faltantes en las tablas de FUNDACION
-- ----------------------------------------------------------------------------
-- Problema: membresias / organizaciones / usuarios tienen RLS ACTIVO pero SIN
-- politicas, asi que el rol authenticated no puede leer ni su propia membresia.
-- Las tablas de DATOS funcionan porque usan es_miembro() (SECURITY DEFINER, que
-- lee membresias por dentro saltando RLS). Pero getSession() lee membresias
-- directamente y se queda en cero filas -> sesion nula -> bucle de login.
--
-- Solucion: cada usuario puede leer SU propia membresia, SU perfil y las
-- organizaciones de las que es miembro. Sin recursion: es_miembro es DEFINER.
--
-- Ejecutar despues de 0002. Es idempotente.
-- ============================================================================

alter table membresias    enable row level security;
alter table organizaciones enable row level security;
alter table usuarios       enable row level security;

-- --- membresias: ver solo las propias ---
drop policy if exists membresias_self on membresias;
create policy membresias_self on membresias
  for select
  using (usuario_id = auth.uid());

-- --- usuarios: ver/editar solo el propio perfil ---
drop policy if exists usuarios_self on usuarios;
create policy usuarios_self on usuarios
  for select
  using (id = auth.uid());

drop policy if exists usuarios_self_update on usuarios;
create policy usuarios_self_update on usuarios
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- --- organizaciones: ver las organizaciones donde soy miembro ---
drop policy if exists organizaciones_member on organizaciones;
create policy organizaciones_member on organizaciones
  for select
  using (es_miembro(id));
