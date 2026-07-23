-- ============================================================================
-- Kenzly CASFA — Contabilidad: rol contador y costo de la boleta
-- ----------------------------------------------------------------------------
-- Acuerdo de la junta de Contabilidad: la app entrega las boletas de acopio y
-- Contabilidad (Vicky) captura el PRECIO POR KILO; el sistema calcula el importe
-- y el importe pagado. Ese costo NO debe verlo el área operativa (Axel y los
-- inspectores): sólo Contabilidad.
--
-- Cómo se garantiza que el operativo no vea el costo:
--   El costo vive en una TABLA APARTE (entrada_costo) con RLS que sólo deja
--   entrar a admin/contador. El operativo ni siquiera puede consultarla — no es
--   cuestión de ocultar una columna en la app, es que la fila no existe para él.
--   Las entradas (peso, calidad) siguen siendo visibles para todos los miembros.
--
-- Ejecutar después de 0035.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Rol contador. `rol` es el enum rol_membresia; Postgres no deja usar un valor
-- de enum recién agregado en la MISMA transacción, así que los helpers comparan
-- el rol CASTEADO A TEXTO para no depender del literal del enum.
-- ----------------------------------------------------------------------------
alter type rol_membresia add value if not exists 'contador';

-- ¿El usuario actual puede ver/editar dinero (costo, precios, ventas)?
-- DEFINER para leer membresias saltando su RLS (mismo patrón que es_miembro).
create or replace function es_contador(org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from membresias m
    where m.org_id = org
      and m.usuario_id = auth.uid()
      and m.rol::text in ('admin', 'contador')
  );
$$;

-- ----------------------------------------------------------------------------
-- Costo de la boleta (1 fila por entrada). Separada de `entradas` justamente
-- para que la RLS la esconda del operativo.
--   importe = precio_kg × kg_netos  (lo calcula la app al guardar, con los
--   kilos netos que ya trae la entrada; se guarda para el reporte).
-- ----------------------------------------------------------------------------
create table if not exists entrada_costo (
  entrada_id     uuid primary key references entradas(id) on delete cascade,
  org_id         uuid not null references organizaciones(id) on delete cascade,
  precio_kg      numeric(12,4),
  importe        numeric(16,2),
  importe_pagado numeric(16,2) not null default 0,
  factura        text,
  observaciones  text,
  actualizado_por uuid references usuarios(id) on delete set null,
  updated_at     timestamptz not null default now()
);
create index if not exists entrada_costo_org_idx on entrada_costo (org_id);

alter table entrada_costo enable row level security;

-- Sólo Contabilidad (admin/contador) ve y toca el costo.
drop policy if exists solo_contabilidad on entrada_costo;
create policy solo_contabilidad on entrada_costo
  for all
  using (es_contador(org_id))
  with check (es_contador(org_id));

grant select, insert, update, delete on entrada_costo to authenticated;

notify pgrst, 'reload schema';
