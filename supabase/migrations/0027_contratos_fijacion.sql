-- ============================================================================
-- Kenzly CASFA — Módulo 8: Contratos de fijación (compra de café al productor)
-- ----------------------------------------------------------------------------
-- Digitaliza el "Contrato de fijación" que hoy vive en plantillas de Excel/Word
-- (Formato compra pergamino.xls, Contrato Monte Blanco.xls) y se archiva como
-- PDF firmado (EJEMPLOS DE CONTRRATO DE FIJACION/*.pdf, folios 86…181).
--
-- Es el eslabón que va ANTES de la remisión y del acopio. Fija con el productor
-- el precio y la calidad del café ANTES de recogerlo, y su folio dispara la
-- remisión que da trazabilidad al traslado:
--
--   contrato_fijacion (folio) ──> remisiones ──> entradas (boleta) ──> maquila …
--
-- Modelo del negocio (confirmado con Jorge):
--   · El COMPRADOR siempre es CASFA (datos en contrato_config, una vez por org).
--   · El VENDEDOR es el productor (input; FK al padrón + snapshot de texto).
--   · Arbitraje CONMUTABLE por contrato:
--       - nacional      → Cámara Nacional de Comercio
--       - internacional → "Contrato C" de la Bolsa de Nueva York (ICE)
--   · Una plantilla por tipo de café (Árabe pergamino/oro, Robusta cereza/oro,
--     Cacao fermentado/lavado): cambia la cláusula de calidad y la costalera;
--     el resto de los "horizontes" del contrato son iguales.
--   · Firma electrónica: el vendedor y Adrián (representante de CASFA) firman en
--     pantalla; el sello de CASFA lo genera la app (vector, no imagen subida).
--
-- Reusa la fundación multi-tenant (org_id + es_miembro) y el patrón de folio
-- transaccional del acopio. Escritura sólo para editor comercial (como CRM).
-- Ejecutar después de 0026.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type contrato_estado as enum (
    'borrador','emitido','firmado','cumplido','cancelado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type arbitraje_tipo as enum ('nacional','internacional');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Configuración del comprador (CASFA) por organización. UNA fila por org: los
-- datos que salen IGUALES en todos los contratos. Editable desde la app.
-- El firmante (Adrián) y su firma en pantalla viven aquí; el sello NO se guarda
-- como imagen: lo dibuja la app a partir de estos textos.
-- ----------------------------------------------------------------------------
create table if not exists contrato_config (
  org_id             uuid primary key references organizaciones(id) on delete cascade,
  razon_social       text not null,
  rfc                text,
  domicilio_fiscal   text,
  representante_nombre text,                    -- Adrián … (firmante por CASFA)
  representante_cargo  text,
  -- Firma de Adrián capturada en pantalla (data URL en Storage). Se estampa en
  -- el bloque del comprador de cada contrato.
  firma_representante_url text,
  -- Textos del sello que dibuja la app (anillo exterior / centro).
  sello_leyenda      text not null default 'CENTRO AGROECOLÓGICO SAN FRANCISCO DE ASÍS',
  sello_centro       text not null default 'CASFA',
  sello_lugar        text default 'CHIAPAS · MÉXICO',
  -- Cláusulas de arbitraje (texto), una por variante. Se copian al contrato al
  -- emitirlo, para que un cambio futuro no altere contratos ya firmados.
  arbitraje_nacional_texto text not null default
    'Para la interpretación y cumplimiento del presente contrato, las partes se '
    'someten al arbitraje de la Cámara Nacional de Comercio, renunciando al fuero '
    'que por su domicilio presente o futuro pudiera corresponderles.',
  arbitraje_internacional_texto text not null default
    'Cualquier controversia derivada del presente contrato se resolverá conforme '
    'a las reglas del Contrato "C" de la Bolsa de Nueva York (ICE Futures U.S.), '
    'incluyendo sus disposiciones de arbitraje.',
  lugar_firma        text default 'Motozintla de Mendoza, Chiapas',
  updated_at         timestamptz not null default now()
);
alter table contrato_config enable row level security;
drop policy if exists org_read on contrato_config;
create policy org_read on contrato_config for select using (es_miembro(org_id));
drop policy if exists org_write on contrato_config;
create policy org_write on contrato_config for all
  using (es_editor_comercial(org_id)) with check (es_editor_comercial(org_id));
grant select, insert, update, delete on contrato_config to authenticated;

-- ----------------------------------------------------------------------------
-- Plantilla por tipo de café: las cláusulas que cambian según el producto.
-- Config como datos (igual que acopio_producto). El contrato copia estos textos
-- al emitirse (snapshot), no los referencia en vivo.
-- ----------------------------------------------------------------------------
create table if not exists contrato_plantilla (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  especie       text not null,                  -- ARABE | ROBUSTA | CACAO
  tipo          text not null,                  -- PERGAMINO | ORO | CEREZO | ...
  nombre        text not null,                  -- "Café Árabe Pergamino Orgánico"
  unidad        text not null default 'quintal',-- quintal | kg
  moneda        text not null default 'MXN',    -- MXN | USD
  calidad_texto   text not null default '',
  costalera_texto text not null default '',
  condiciones_texto text not null default '',
  activo        boolean not null default true,
  unique (org_id, especie, tipo)
);
alter table contrato_plantilla enable row level security;
drop policy if exists org_read on contrato_plantilla;
create policy org_read on contrato_plantilla for select using (es_miembro(org_id));
drop policy if exists org_write on contrato_plantilla;
create policy org_write on contrato_plantilla for all
  using (es_editor_comercial(org_id)) with check (es_editor_comercial(org_id));
grant select, insert, update, delete on contrato_plantilla to authenticated;

-- ----------------------------------------------------------------------------
-- Contador de folio por organización (secuencia transaccional, no MAX+1).
-- ----------------------------------------------------------------------------
create table if not exists contrato_contador (
  org_id       uuid primary key references organizaciones(id) on delete cascade,
  ultimo_folio int not null default 0
);
alter table contrato_contador enable row level security;
drop policy if exists org_isolation on contrato_contador;
create policy org_isolation on contrato_contador
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on contrato_contador to authenticated;

-- ----------------------------------------------------------------------------
-- Contratos de fijación
-- ----------------------------------------------------------------------------
create table if not exists contrato_fijacion (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizaciones(id) on delete cascade,
  folio         int not null,                   -- consecutivo visible por org
  fecha         date not null default current_date,
  ciclo         text,                           -- temporada, p.ej. "2025-2026"

  -- Vendedor: FK al padrón (opcional) + snapshot para que el PDF no cambie si
  -- el padrón se edita después.
  productor_id      uuid references productores(id) on delete set null,
  vendedor_nombre   text not null,
  vendedor_domicilio text,
  vendedor_curp     text,
  vendedor_rfc      text,
  vendedor_telefono text,
  comunidad         text,
  municipio         text,

  -- Producto (validado contra contrato_plantilla).
  especie       text not null,
  tipo          text not null,

  -- Términos comerciales
  cantidad        numeric(14,3) not null,       -- en `unidad` (quintales o kg)
  unidad          text not null default 'quintal',
  precio_unitario numeric(14,4) not null,
  moneda          text not null default 'MXN',
  importe         numeric(16,2) generated always as
                    (round(cantidad * precio_unitario, 2)) stored,
  anticipo        numeric(16,2) not null default 0,
  fecha_entrega   date,

  arbitraje     arbitraje_tipo not null default 'nacional',

  -- Snapshot de cláusulas al emitir (inmutables una vez firmado).
  calidad_texto   text,
  costalera_texto text,
  condiciones_texto text,
  arbitraje_texto text,
  lugar_firma     text,

  -- Firma electrónica (rutas en Storage; el sello lo dibuja la app).
  firma_vendedor_url  text,
  firma_comprador_url text,                      -- Adrián, al emitir/firmar
  firmado_vendedor_at  timestamptz,
  firmado_comprador_at timestamptz,

  estado        contrato_estado not null default 'borrador',
  observaciones text,
  creado_por    uuid references usuarios(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, folio)
);
create index if not exists contrato_org_fecha_idx on contrato_fijacion (org_id, fecha desc);
create index if not exists contrato_productor_idx  on contrato_fijacion (productor_id);

alter table contrato_fijacion enable row level security;
drop policy if exists org_read on contrato_fijacion;
create policy org_read on contrato_fijacion for select using (es_miembro(org_id));
drop policy if exists org_write on contrato_fijacion;
create policy org_write on contrato_fijacion for all
  using (es_editor_comercial(org_id)) with check (es_editor_comercial(org_id));
grant select, insert, update, delete on contrato_fijacion to authenticated;

-- Asignación transaccional del folio por org al insertar.
create or replace function contrato_asignar_folio() returns trigger as $$
declare v_folio int;
begin
  if new.folio is not null and new.folio > 0 then
    return new;
  end if;
  insert into contrato_contador (org_id, ultimo_folio) values (new.org_id, 0)
    on conflict (org_id) do nothing;
  update contrato_contador
     set ultimo_folio = ultimo_folio + 1
   where org_id = new.org_id
  returning ultimo_folio into v_folio;
  new.folio := v_folio;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_contrato_folio on contrato_fijacion;
create trigger trg_contrato_folio before insert on contrato_fijacion
  for each row execute function contrato_asignar_folio();

-- ----------------------------------------------------------------------------
-- Enlace contrato → remisión: el folio del contrato dispara la trazabilidad.
-- La remisión ya existe (0026); aquí sólo le agregamos de qué contrato nace.
-- ----------------------------------------------------------------------------
alter table remisiones
  add column if not exists contrato_id uuid references contrato_fijacion(id) on delete set null;
create index if not exists remisiones_contrato_idx on remisiones (contrato_id);

-- ----------------------------------------------------------------------------
-- Semilla para CASFA (idempotente).
-- ----------------------------------------------------------------------------
do $$
declare v_org uuid;
begin
  select id into v_org from organizaciones where slug = 'casfa';
  if v_org is null then
    raise notice 'org casfa no encontrada; omito semilla de contratos';
    return;
  end if;

  -- Config del comprador. Datos extraídos de la plantilla; Jorge afina el
  -- nombre/cargo de Adrián desde la app.
  insert into contrato_config (org_id, razon_social, domicilio_fiscal, representante_cargo)
  values (
    v_org,
    'CENTRO AGROECOLÓGICO SAN FRANCISCO DE ASÍS S.A. DE C.V.',
    '4a. Av. Sur No. 115, Col. San Sebastián, Motozintla de Mendoza, Chiapas',
    'Representante Legal'
  )
  on conflict (org_id) do nothing;

  -- Plantillas por tipo de café. Los mismos combos que acopio_producto.
  insert into contrato_plantilla (org_id, especie, tipo, nombre, unidad, moneda,
                                  calidad_texto, costalera_texto, condiciones_texto) values
    (v_org, 'ARABE', 'PERGAMINO', 'Café Árabe Pergamino Orgánico', 'quintal', 'MXN',
     'Rendimiento mínimo 82%, cerezo máximo 4%, humedad de 11 a 12%, mancha máxima 12%. '
     'Café limpio, sin olor a moho ni fermento, sin mezcla de café añejo, robusta ni de baja altura.',
     'El café se entregará y transportará en costal de yute o henequén; no se aceptan costales de plástico. '
     'Cada costal debe etiquetarse con nombre y número de productor, año de cosecha, localidad y certificadora.',
     'Se descontará el porcentaje excedente de humedad y mancha sobre el precio, conforme a la norma CASFA.'),
    (v_org, 'ARABE', 'ORO', 'Café Árabe Oro Orgánico', 'quintal', 'MXN',
     'Café oro de exportación, humedad máxima 12.5%, mancha máxima 12%, mínimo 90% de uniformidad. '
     'Preparación europea o americana según zaranda.', '', ''),
    (v_org, 'ROBUSTA', 'CEREZO', 'Café Robusta Cereza', 'quintal', 'MXN',
     'Rendimiento mínimo 60%, humedad máxima 12.5%, mancha máxima 16%, granos negros máximo 5%. '
     'Café limpio, sin olor a moho, tierra ni fermento.',
     'El café se entregará en costal de yute o henequén, etiquetado por productor.', ''),
    (v_org, 'ROBUSTA', 'ORO', 'Café Robusta Oro', 'quintal', 'MXN',
     'Café robusta oro, humedad máxima 12.5%, mancha máxima 16%.', '', ''),
    (v_org, 'CACAO', 'FERMENTADO', 'Cacao Fermentado', 'kg', 'MXN',
     'Cacao fermentado y seco, humedad máxima 8%.', '', ''),
    (v_org, 'CACAO', 'LAVADO', 'Cacao Lavado', 'kg', 'MXN',
     'Cacao lavado y seco, humedad máxima 8%.', '', '')
  on conflict (org_id, especie, tipo) do nothing;
end $$;

notify pgrst, 'reload schema';
