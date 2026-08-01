-- ============================================================================
-- Kenzly CASFA — Rol VENTAS: acceso de escritura al CRM
-- ----------------------------------------------------------------------------
-- El CRM (0022) restringe INSERT/UPDATE/DELETE a admin/coordinador vía
-- es_editor_comercial(); sin este cambio Diego vería el CRM (una vez agregado
-- a lib/acceso.ts) pero cualquier intento de crear/editar una cuenta u
-- oportunidad le rebotaría en RLS, no en la interfaz.
--
-- Las tablas de Ventas (0018: ventas_cliente, ventas_producto, ventas_factura,
-- ventas_detalle, ventas_stock, ventas_precio_cliente) YA usan es_miembro()
-- simple — cualquier miembro de la org lee/escribe — así que no necesitan
-- ningún cambio de RLS para el rol nuevo.
--
-- Ejecutar después de 0051 (el enum 'ventas' debe existir ya, committed).
-- ============================================================================

create or replace function es_editor_comercial(org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from membresias m
    where m.org_id = org
      and m.usuario_id = auth.uid()
      and m.rol in ('admin', 'coordinador', 'ventas')
  );
$$;

-- crm_miembros_org() ahora también trae el rol, para poder filtrar el picker
-- de "responsable" a sólo vendedores (más admin) al dar de alta una cuenta —
-- no tiene caso ofrecer a un inspector de SIC como dueño de una cuenta comercial.
-- CREATE OR REPLACE no permite cambiar la forma de un "returns table" (nueva
-- columna); hay que dropearla primero.
drop function if exists crm_miembros_org();
create function crm_miembros_org()
returns table (id uuid, nombre text, email text, rol text)
language sql stable security definer set search_path = public
as $$
  select u.id, u.nombre, u.email, m.rol::text
  from usuarios u
  join membresias m on m.usuario_id = u.id
  where m.org_id in (
    select org_id from membresias where usuario_id = auth.uid()
  )
  order by coalesce(u.nombre, u.email);
$$;
grant execute on function crm_miembros_org() to authenticated;

notify pgrst, 'reload schema';
