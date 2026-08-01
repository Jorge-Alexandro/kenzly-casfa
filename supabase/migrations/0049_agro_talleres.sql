-- ============================================================================
-- Kenzly CASFA — Agroecología: talleres como EVENTO y su reporte automático
-- ----------------------------------------------------------------------------
-- Hoy cada reporte de taller se escribe a mano en Word: 117 documentos de ~10
-- páginas. Al comparar los reportes de un mismo tipo, el 63–80% del texto es
-- IDÉNTICO (introducción, objetivos, ficha descriptiva, desarrollo técnico,
-- acuerdos, conclusiones). Lo único que cambia por evento son ~8 datos:
-- comunidad, fecha, horas y el técnico que lo impartió.
--
-- Por eso se parte en dos:
--   agro_plantilla_taller → el texto fijo, UNA vez por (programa, tipo).
--   agro_taller           → el evento: dónde, cuándo, quién. 8 campos.
-- El reporte se arma de plantilla + evento + asistencia + fotos.
--
-- El engrane con lo que ya existe:
--   · agro_tipo_taller / agro_comunidad (0013) — no se duplican, se referencian.
--   · asistencia_lista (0044) — la lista con firmas ES la fuente de quién
--     asistió. De ahí salen F/M y el % de avance de la matriz, que hoy se
--     teclea a mano y puede contradecir a la lista real.
--
-- Ejecutar después de 0048.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Plantilla: el 63–80% que hoy se reescribe en cada reporte.
--
-- Los textos admiten marcadores que el generador sustituye por los datos del
-- evento: {comunidad} {municipio} {fecha_larga} {tecnico} {hora_inicio}
-- {hora_fin}. Así el párrafo "La reunión dio inicio a las {hora_inicio} del
-- {fecha_larga} en {comunidad}" vive escrito UNA vez.
-- ----------------------------------------------------------------------------
create table if not exists agro_plantilla_taller (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  programa_id    uuid not null references agro_programa(id) on delete cascade,
  tipo_taller_id uuid not null references agro_tipo_taller(id) on delete cascade,

  nombre_taller  text not null,          -- "Conservación de suelo y agua"
  participantes  text,                   -- párrafo fijo de quiénes asisten
  asesores       text,                   -- "Equipo técnico del área de agroecología"

  introduccion         text,
  objetivo_general     text,
  objetivos_especificos text[] not null default '{}',
  -- Tabla del formato: [{tema, actividades, materiales, duracion, responsable}]
  ficha_descriptiva    jsonb  not null default '[]',
  desarrollo           text,             -- el cuerpo técnico (lo más largo)
  acuerdos             text,
  conclusiones         text,

  -- De qué reporte real salió, para poder auditar la extracción.
  origen_archivo text,
  updated_at     timestamptz not null default now(),
  unique (programa_id, tipo_taller_id)
);
create index if not exists agro_plantilla_prog_idx on agro_plantilla_taller (programa_id);

alter table agro_plantilla_taller enable row level security;
drop policy if exists org_isolation on agro_plantilla_taller;
create policy org_isolation on agro_plantilla_taller
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on agro_plantilla_taller to authenticated;

-- ----------------------------------------------------------------------------
-- El taller impartido (el evento). Esto es lo único que se captura por reunión.
--
-- `lista_id` engancha la lista de asistencia con firmas: cuando existe, F/M y
-- el avance salen de ahí y no se teclean. En los 117 históricos va en null —
-- esas listas se firmaron en papel y están escaneadas en los PDF viejos.
-- ----------------------------------------------------------------------------
create table if not exists agro_taller (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizaciones(id) on delete cascade,
  programa_id    uuid not null references agro_programa(id) on delete cascade,
  tipo_taller_id uuid not null references agro_tipo_taller(id) on delete cascade,
  comunidad_id   uuid references agro_comunidad(id) on delete set null,

  -- Snapshot del lugar: el reporte es un documento fechado y no debe cambiar
  -- si mañana se corrige el nombre de la comunidad en el catálogo.
  comunidad      text not null,
  municipio      text,

  fecha          date not null,
  hora_inicio    text,                   -- "09:00 am" tal como se escribe
  hora_fin       text,
  tecnico        text,

  -- Lo específico del día que no está en la plantilla.
  notas          text,
  observaciones  text,

  lista_id       uuid references asistencia_lista(id) on delete set null,

  -- Sólo para los 117 cargados del histórico.
  origen_archivo text,
  historico      boolean not null default false,

  created_by     uuid references usuarios(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists agro_taller_prog_fecha_idx on agro_taller (programa_id, fecha desc);
create index if not exists agro_taller_comunidad_idx on agro_taller (comunidad_id);
-- Un mismo taller no se imparte dos veces el mismo día en la misma comunidad:
-- evita duplicar al recargar el histórico o al doble clic en Guardar.
create unique index if not exists agro_taller_unico
  on agro_taller (programa_id, tipo_taller_id, lower(comunidad), fecha);

alter table agro_taller enable row level security;
drop policy if exists org_isolation on agro_taller;
create policy org_isolation on agro_taller
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on agro_taller to authenticated;

-- ----------------------------------------------------------------------------
-- Evidencias fotográficas del taller (el anexo del reporte).
-- ----------------------------------------------------------------------------
create table if not exists agro_taller_foto (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizaciones(id) on delete cascade,
  taller_id   uuid not null references agro_taller(id) on delete cascade,
  url         text not null,             -- Storage o data URI
  descripcion text,
  orden       int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists agro_taller_foto_taller_idx on agro_taller_foto (taller_id, orden);

alter table agro_taller_foto enable row level security;
drop policy if exists org_isolation on agro_taller_foto;
create policy org_isolation on agro_taller_foto
  using (es_miembro(org_id)) with check (es_miembro(org_id));
grant select, insert, update, delete on agro_taller_foto to authenticated;

notify pgrst, 'reload schema';
