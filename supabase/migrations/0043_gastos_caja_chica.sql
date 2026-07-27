-- ============================================================================
-- Kenzly CASFA — Gastos: programas "Caja Chica" y "Gastos" (Emily)
-- ----------------------------------------------------------------------------
-- Además de Certificación y Agroecología, Emily lleva dos libros más:
--   • Caja Chica — el efectivo del día a día.
--   • Gastos     — un cajón de "otros" para lo que no cae en un programa.
--
-- Cada uno con un catálogo genérico de categorías (las columnas de su matriz).
-- Si hace falta afinar las categorías, se cambian en gasto_categoria; el reporte
-- se arma solo a partir de los movimientos.
--
-- Ejecutar después de 0042.
-- ============================================================================

do $$
declare
  o uuid;
  p_caja uuid;
  p_gastos uuid;
begin
  select id into o from organizaciones where slug = 'casfa';
  if o is null then
    raise notice 'no existe la organización casfa; se omite el catálogo';
    return;
  end if;

  insert into gasto_programa (org_id, clave, nombre, orden) values
    (o, 'CAJA_CHICA', 'Caja Chica', 3),
    (o, 'GASTOS',     'Gastos',     4)
  on conflict (org_id, clave) do nothing;

  select id into p_caja   from gasto_programa where org_id = o and clave = 'CAJA_CHICA';
  select id into p_gastos from gasto_programa where org_id = o and clave = 'GASTOS';

  insert into gasto_categoria (org_id, programa_id, nombre, orden) values
    (o, p_caja, 'Papelería',    1),
    (o, p_caja, 'Alimentos',    2),
    (o, p_caja, 'Transporte',   3),
    (o, p_caja, 'Combustible',  4),
    (o, p_caja, 'Limpieza',     5),
    (o, p_caja, 'Mensajería',   6),
    (o, p_caja, 'Varios',       7)
  on conflict (programa_id, nombre) do nothing;

  insert into gasto_categoria (org_id, programa_id, nombre, orden) values
    (o, p_gastos, 'Servicios',       1),
    (o, p_gastos, 'Mantenimiento',   2),
    (o, p_gastos, 'Papelería',       3),
    (o, p_gastos, 'Transporte',      4),
    (o, p_gastos, 'Combustible',     5),
    (o, p_gastos, 'Nómina',          6),
    (o, p_gastos, 'Varios',          7)
  on conflict (programa_id, nombre) do nothing;
end $$;

notify pgrst, 'reload schema';
