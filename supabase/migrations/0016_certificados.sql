-- ============================================================================
-- Kenzly CASFA — Certificados: vencimientos y alertas
-- ----------------------------------------------------------------------------
-- CASFA certifica cada PROGRAMA (Comercialización, Cultivos Tropicales, Café
-- Árabe, Flor de Pascuas/Robusta) bajo varios ESQUEMAS (NOP USDA, UE, LPO),
-- cada uno con su fecha de vencimiento y el estado del trámite. Hoy vive en un
-- xlsx suelto; aquí se modela para poder ALERTAR antes de que venzan.
-- Ejecutar después de 0015.
-- ============================================================================

create table if not exists certificado (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizaciones(id) on delete cascade,
  programa           text not null,           -- "Cultivos Tropicales", …
  esquema            text not null,           -- "NOP USDA" | "UE" | "LPO"
  fecha_vencimiento  date,
  estado             text,                    -- estado del trámite (nota)
  notas              text,
  updated_at         timestamptz not null default now(),
  unique (org_id, programa, esquema)
);
create index if not exists certificado_org_idx on certificado (org_id, fecha_vencimiento);

alter table certificado enable row level security;
drop policy if exists org_isolation on certificado;
create policy org_isolation on certificado
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on certificado to authenticated;

-- ----------------------------------------------------------------------------
-- Semilla con los datos reales del xlsx "FECHA DE VENCIMIENTO EN LOS
-- CERTIFICADOS DE LOS DIFERENTES PROGRAMAS" (idempotente).
-- ----------------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  select id into v_org from organizaciones where slug = 'casfa';
  if v_org is null then
    raise notice 'org casfa no encontrada; omito semilla de certificados';
    return;
  end if;

  insert into certificado (org_id, programa, esquema, fecha_vencimiento, estado) values
    (v_org, 'Comercialización',        'NOP USDA', '2026-06-05', 'Esperando respuesta de certificado de comercialización'),
    (v_org, 'Comercialización',        'UE',       '2026-04-21', 'Esperando respuesta de certificado de comercialización'),
    (v_org, 'Comercialización',        'LPO',      '2026-09-27', 'Esperando respuesta de certificado de comercialización'),
    (v_org, 'Cultivos Tropicales',     'NOP USDA', '2026-03-18', 'En proceso de dictaminación, esperando resultados finales'),
    (v_org, 'Cultivos Tropicales',     'UE',       '2026-04-21', 'En proceso de dictaminación, esperando resultados finales'),
    (v_org, 'Cultivos Tropicales',     'LPO',      '2026-04-24', 'En proceso de dictaminación, esperando resultados finales'),
    (v_org, 'CASFA Programa Café Árabe','NOP USDA','2026-06-05', 'En proceso de llenado de documentación para pedir inspección externa'),
    (v_org, 'CASFA Programa Café Árabe','UE',      '2026-04-21', 'En proceso de llenado de documentación para pedir inspección externa'),
    (v_org, 'CASFA Programa Café Árabe','LPO',     '2026-11-03', 'En proceso de llenado de documentación para pedir inspección externa'),
    (v_org, 'Flor de Pascuas / Robusta','NOP USDA','2026-08-11', 'Certificado vigente'),
    (v_org, 'Flor de Pascuas / Robusta','UE',      '2026-11-08', 'Certificado vigente'),
    (v_org, 'Flor de Pascuas / Robusta','LPO',     '2026-11-08', 'Certificado vigente')
  on conflict (org_id, programa, esquema)
    do update set fecha_vencimiento = excluded.fecha_vencimiento,
                  estado = excluded.estado;
end $$;

-- Recarga el cache de PostgREST para que vea la tabla nueva de inmediato.
notify pgrst, 'reload schema';
