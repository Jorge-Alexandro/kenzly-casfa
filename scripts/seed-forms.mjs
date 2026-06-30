// Seed de las 3 fichas REALES de CASFA en el motor configurable
// (form_templates -> form_secciones -> form_campos).
//
// Los campos provienen de los placeholders <<[...]>> de las plantillas .docx
// reales (Robusta, Arabe, Tropicales). Se EXCLUYEN los campos de cabecera
// derivados de la seleccion (productor, comunidad, municipio, inspector, fecha,
// nombre/numero de parcela, area cultivada): esos no se capturan, se dereferencian.
//
// Idempotente: borra los templates de la org y los recrea. Solo seguro mientras
// no existan fichas que referencien un template (no hay aun).
//
// Uso: node scripts/seed-forms.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim()
const admin = createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const SINO = ['Sí', 'No'] // columnas SI/NO de la ficha técnica real
const CUMPLE = ['Sí', 'Parcialmente', 'No'] // resumen de cumplimiento por sección
const RESULTADO = ['Aprobado', 'Aprobado con Condiciones', 'Sancionado']

// Columnas de tablas (filas repetibles) pedidas por el SIC.
// Densidad de siembra = 10000 / (marco A × marco B) — marco de plantación.
const VARIEDADES_COLS = [
  { id: 'variedad', label: 'Variedad', tipo: 'text' },
  { id: 'marco_a', label: 'Marco A (m)', tipo: 'number' },
  { id: 'marco_b', label: 'Marco B (m)', tipo: 'number' },
  { id: 'densidad_siembra', label: 'Densidad de siembra (plantas/ha)', tipo: 'calc', formula: '10000/(marco_a*marco_b)' },
]
const DIVERSIDAD_COLS = [
  { id: 'especie', label: 'Especie', tipo: 'text' },
  { id: 'cantidad', label: 'Cantidad aprox.', tipo: 'number' },
  { id: 'altura_m', label: 'Altura (m)', tipo: 'number' },
]
const VIVERO_COLS = [
  { id: 'variedad', label: 'Variedad', tipo: 'text' },
  { id: 'cantidad', label: 'Cantidad de plantas', tipo: 'number' },
]

// Helper: define un campo. tipo: enum|text|longtext|number|date|signature|tabla
// config (opcional): { condicion, columnas, autofill, opcion_otro }
const f = (nombre_interno, etiqueta, tipo = 'enum', opciones = SINO, config = {}) => ({
  nombre_interno,
  etiqueta,
  tipo,
  opciones: tipo === 'enum' ? opciones : null,
  config,
})

// Helpers para legibilidad de los nuevos requisitos del SIC:
const mostrarSi = (campo, igual = 'Sí') => ({ condicion: { campo, igual } })
const enumOtro = ['Otro'] // se concatena a las opciones; activa opcion_otro

// ----------------------------------------------------------------------------
// FICHA ROBUSTA
// ----------------------------------------------------------------------------
const ROBUSTA = {
  tipo_cultivo: 'cafe',
  tipo_ficha: 'robusta',
  nombre: 'Ficha Robusta',
  secciones: [
    {
      nombre: '2. Información de la parcela',
      campos: [
        f('variedades', 'Variedades y marco de plantación', 'tabla', null, { columnas: VARIEDADES_COLS }),
        f('produccion_anterior', 'Producción anterior cosechada (qq)', 'number', null, { autofill: 'produccion_anterior' }),
        f('produccion_actual', 'Producción actual (qq)', 'number', null, { autofill: 'produccion_actual' }),
        f('observaciones_parcela', 'Observaciones', 'longtext'),
      ],
    },
    {
      nombre: '3. Producción de plantas y renovación de café',
      campos: [
        f('tiene_vivero', '¿Cuenta con vivero de café?'),
        f(
          'mismo_cafetal',
          '¿Las semillas y plántulas de café y árboles de sombra se obtienen en el mismo cafetal?',
        ),
        f('insumos_quimicos', '¿Uso de insumos químicos en semilleros y viveros?'),
        f(
          'usa_ogm',
          '¿Uso de semillas obtenidas de organismos genéticamente modificados (OGM / transgénicos)?',
        ),
        f(
          'renovacion',
          'Renovación de cafetos y sombra: ¿el productor mantiene su cafetal en condiciones de producción aceptables replantando/reponiendo sistemáticamente cafetos viejos e improductivos?',
        ),
        f('resiembra', 'Resiembra: cafetos sembrados este año', 'number', null, mostrarSi('renovacion')),
        f(
          'inga',
          '¿Se siembran árboles o leguminosa (Inga) a lo largo de las plantaciones de café de modo que contribuyen a la fertilidad del suelo, a la protección contra la erosión, u otras funciones afines?',
        ),
        f('resiembra_sombra', 'Resiembra de sombra: árboles sembrados este año', 'number', null, mostrarSi('inga')),
        f(
          'manejo_cafetal',
          'Manejo: ¿el productor mantiene su cafetal en condiciones de producción aceptables realizando prácticas de manejo?',
        ),
        f(
          'cumple_produccion',
          'La producción de plantas y manejo del cafetal cumple con las normas internas de CASFA',
          'enum',
          CUMPLE,
        ),
      ],
    },
    {
      nombre: '4. Manejo de sombra y diversificación',
      campos: [
        f('densidad_sombra', 'Densidad de sombra / cobertura', 'enum', ['Excesiva', 'Regular', 'Falta sombra']),
        f('especies_sombra', 'Especie de sombra dominante', 'text'),
        f('numero_estratos', 'Número de estratos', 'enum', ['Uno', 'Dos', 'Tres']),
        f('manejo_sombra', 'Manejo de la sombra', 'enum', [
          'Poda de árboles',
          'Corte selectivo de árboles',
          'Reforestación con spp nativas',
          'Introducción de spp exóticas',
        ], { multiple: true }),
        f('diversidad_especies', 'Diversidad de especies y cantidad aproximada', 'tabla', null, { columnas: DIVERSIDAD_COLS }),
        f('tipo_sombra', 'Tipo de sombra (gradiente A/B/C/D)', 'enum', ['A', 'B', 'C', 'D'], { multiple: true }),
        f(
          'cumple_sombra',
          'El manejo de sombra y los recursos hídricos cumplen con las normas internas de CASFA',
          'enum',
          CUMPLE,
        ),
      ],
    },
    {
      nombre: '5. Conservación del ecosistema',
      campos: [
        f(
          'actividades_conservacion',
          'Realiza actividades para proteger, conservar y recuperar el bosque, la montaña y ecosistemas naturales.',
        ),
        f(
          'talar',
          'Prohibición de talar, deforestar el bosque primario, causar daños al ecosistema natural.',
        ),
        f(
          'evidencia_deforestacion',
          'Existe evidencia de tala indiscriminada, deforestación, quema de montaña.',
        ),
        f('proteccion_hidrica', 'Protección de los recursos hídricos.'),
        f(
          'prohibicion_caceria',
          'Prohibición de la cacería. El productor está consciente que está prohibido la cacería, recolección, extracción y el tráfico de animales silvestres.',
        ),
      ],
    },
    {
      nombre: '6. Manejo del suelo y fertilidad',
      campos: [
        f('erosion', '¿Encontró evidencias de erosión de suelo?'),
        f(
          'conservacion_suelo',
          '¿El productor toma medidas de conservación de suelos como corte de hierba alto, terrazas individuales, barreras físicas o barreras vivas establecidas a lo largo de las líneas de contorno a intervalos adecuados para las condiciones del sitio?',
        ),
        f('abono_organico', '¿El productor elabora abono orgánico?'),
        f('materiales', 'Describa los materiales empleados en su elaboración.', 'text', null, mostrarSi('abono_organico')),
        f('estiercol', '¿El productor usa estiércol animal?'),
        f(
          'desecho',
          '¿Los desechos de procesamiento orgánico (cáscara, pulpa y cerezas no aceptables, sedimentos de las fosas) son reciclados en la parcela para producir abono de manera que no ejerza impacto negativo en el ambiente circundante?',
        ),
        f(
          'poda',
          '¿Los restos de la poda de árboles de sombra, hierbas y/o barreras vivas se acumulan sobre los suelos como enmiendas?',
        ),
        f(
          'capa_materia_organica',
          '¿Se conserva una capa de materia orgánica compuesta por hojas y biomasa a lo largo de las plantaciones de café de modo que contribuyan al ciclo nutritivo y la actividad biológica de los suelos?',
        ),
        f(
          'cumple_suelo',
          'El manejo de suelo, conservación, fertilidad y uso de insumos cumple con las normas internas de CASFA',
          'enum',
          CUMPLE,
        ),
      ],
    },
    {
      nombre: '7. Control de hierbas, plagas y enfermedades',
      campos: [
        f('deshierbe', '¿Cuántos deshierbes se realizan por año?', 'number'),
        f(
          'evidencia_ins_quim',
          '¿Encontró evidencias de uso de insumos químicos (herbicidas, insecticidas, fungicidas) para el control de hierbas, enfermedades, insectos o plagas en el cafetal (p.ej. aplicación de químicos contra broca u hormigas)?',
        ),
        f('prob_severo', '¿Hay algún problema severo de ataque de plagas o enfermedades?'),
        f('tipo_plagas', 'Tipo de plagas', 'enum', ['Roya', 'Broca', ...enumOtro], { multiple: true, opcion_otro: true }),
        f('control_plagas', 'Métodos de combate', 'enum', ['Cultural', 'Químico'], { multiple: true }),
      ],
    },
    {
      nombre: '8. Riesgos de contaminación',
      campos: [
        f('contaminacion_riesgo', '¿Existe riesgo de contaminación por cultivos colindantes?'),
        f('sobre_que_almacena', '¿Sobre qué almacena sus sacos de café?', 'enum', ['Tarimas', 'Costales', ...enumOtro], { opcion_otro: true, multiple: true }),
        f(
          'areas_amortiguamento',
          'Existen áreas de amortiguamiento que evitan contaminación por parcelas convencionales vecinas.',
        ),
        f('basura_cafetal', '¿Existe en los cafetales presencia de basura doméstica y plásticos?'),
      ],
    },
    {
      nombre: '9. Cosecha y postcosecha',
      campos: [
        f(
          'solo_fruto_maduro',
          'Únicamente se cortan frutos maduros; las cerezas de café que se encuentran en el suelo no se mezclan con las recolectadas del cafeto.',
        ),
        f(
          'riesgo_contaminacion',
          'Existe riesgo de contaminación de los productos orgánicos durante la cosecha, proceso o almacenamiento.',
        ),
        f(
          'productos_mezclados',
          '¿Los productos orgánicos son mezclados/contaminados con productos convencionales durante el manejo postcosecha?',
        ),
      ],
    },
    {
      nombre: '10. Beneficio húmedo',
      campos: [
        f('equipo_beneficio', '¿El productor cuenta con equipo de beneficio húmedo?'),
        f('donde', '¿Dónde beneficia su café?', 'enum', ['Casa', 'Parcela', ...enumOtro], { multiple: true, opcion_otro: true }),
        f(
          'higiene',
          '¿El beneficio húmedo cuenta con las medidas de higiene adecuadas? (despulpadoras, patios, fermentadora)',
        ),
        f('donde_seca', '¿Dónde seca su café?', 'enum', ['Patio de concreto', 'Malla de sombra', 'Costales', ...enumOtro], { opcion_otro: true, multiple: true }),
        f('fuente_agua', 'Fuente de agua limpia para uso en el despulpado, lavado y fermentación del café.', 'enum', [
          'Manantial',
          'Arroyo',
          'Toma doméstica',
        ], { multiple: true }),
        f(
          'acceso_animal',
          '¿El productor evita el acceso de animales y vehículos a las zonas de beneficio, secado y almacenamiento para evitar contaminación del producto?',
        ),
        f(
          'fosa_infiltracion',
          '¿El productor cuenta con una fosa de infiltración para evitar contaminación de fuentes de agua por residuos de cosecha y agua residual de uso en beneficio húmedo?',
        ),
      ],
    },
    {
      nombre: '11. Almacenamiento y transporte',
      campos: [
        f('almacen_adecuado', '¿Cuenta con un almacén exclusivo y adecuado para el producto?'),
        f(
          'riesgo_almacen',
          '¿Hay riesgos de mezcla o contaminación en el lugar donde el productor almacena su producto?',
        ),
        f(
          'se_asegura',
          'El productor se asegura que el sitio donde se guarda el producto sea un lugar separado, seco y mantenga condiciones de limpieza adecuada.',
        ),
        f('insumos_almacen', '¿Existe presencia de insumos químicos en el almacén doméstico del productor?'),
        f('plagas_almacen', '¿Existen plagas en el lugar de almacenamiento?'),
        f('combate_plagas_almacen', '¿Cómo se combaten las plagas?', 'text', null, mostrarSi('plagas_almacen')),
        f('transporte', '¿Cómo se transporta el café desde la casa del productor hacia el Centro de Acopio?', 'enum', [
          'Carro de la empresa',
          'Transporte individual',
          'Otro medio',
        ], { multiple: true }),
        f('riesgo_transporte', '¿Existe riesgo de mezcla o contaminación durante el transporte?'),
      ],
    },
    {
      nombre: '12. Bitácora',
      campos: [
        f('bitacora', '¿Cuenta con bitácora?'),
        f('actividades', 'Describe las actividades realizadas en su parcela', 'longtext'),
      ],
    },
    {
      nombre: 'Resultados de la evaluación',
      campos: [
        f('hallazgos', 'Hallazgos', 'longtext'),
        f('resultado_evaluacion', 'Resultado de la evaluación', 'enum', RESULTADO),
        f('fecha_revision', 'Fecha de revisión', 'date'),
        f('firma_productor', 'Firma del productor', 'signature'),
        f('firma_inspector', 'Firma del inspector', 'signature'),
        f('firma_comite', 'Firma del comité de aprobación', 'signature'),
      ],
    },
  ],
}

// ----------------------------------------------------------------------------
// FICHA ARABE
// ----------------------------------------------------------------------------
const ARABE = {
  tipo_cultivo: 'cafe',
  tipo_ficha: 'arabe',
  nombre: 'Ficha Arábica',
  secciones: [
    {
      nombre: '2. Información de la parcela',
      campos: [
        f('estatus_parcela', 'Estatus de la parcela', 'text'),
        f('variedades', 'Variedades y marco de plantación', 'tabla', null, { columnas: VARIEDADES_COLS }),
        f('produccion_anterior_kg', 'Producción anterior cosechada (kg)', 'number', null, { autofill: 'produccion_anterior' }),
        f('produccion_actual_kg', 'Producción actual (kg)', 'number', null, { autofill: 'produccion_actual' }),
        f('observaciones_parcela', 'Observaciones', 'longtext'),
      ],
    },
    {
      nombre: '3. Producción de plantas y renovación de café',
      campos: [
        f('tiene_vivero', '¿Cuenta con vivero de café?'),
        f('variedad_vivero', 'Variedades del vivero', 'tabla', null, { columnas: VIVERO_COLS, condicion: { campo: 'tiene_vivero', igual: 'Sí' } }),
        f(
          'semillas_misma_parcela',
          '¿Las semillas y plántulas de café y árboles de sombra se obtienen en el mismo cafetal?',
        ),
        f('insumos_viveros', '¿Uso de insumos químicos en semilleros y viveros?'),
        f(
          'usa_ogm',
          '¿Uso de semillas obtenidas de organismos genéticamente modificados (OGM / transgénicos)?',
        ),
        f(
          'renovacion',
          'Renovación de cafetos y sombra: ¿el productor mantiene su cafetal en condiciones de producción aceptables replantando/reponiendo sistemáticamente cafetos viejos e improductivos?',
        ),
        f('resiembra_anio', 'Resiembra: cafetos sembrados este año', 'number', null, mostrarSi('renovacion')),
        f(
          'leguminosas_arboles_suelo',
          '¿Se siembran árboles o leguminosa (Inga) a lo largo de las plantaciones de café de modo que contribuyen a la fertilidad del suelo, a la protección contra la erosión, u otras funciones afines?',
        ),
        f('resiembra_sombra', 'Resiembra de sombra: árboles sembrados este año', 'number', null, mostrarSi('leguminosas_arboles_suelo')),
        f(
          'manejo_cafetal',
          'Manejo: ¿el productor mantiene su cafetal en condiciones de producción aceptables realizando prácticas de manejo?',
        ),
        f(
          'cumple_produccion',
          'La producción de plantas y manejo del cafetal cumple con las normas internas de CASFA',
          'enum',
          CUMPLE,
        ),
      ],
    },
    {
      nombre: '4. Manejo de sombra y diversificación',
      campos: [
        f('densidad_sombra', 'Densidad de sombra / cobertura', 'enum', ['Excesiva', 'Regular', 'Falta sombra']),
        f('especie_sombra_dominante', 'Especie de sombra dominante', 'text'),
        f('altura_dosel_m', 'Altura del dosel principal (mts)', 'number'),
        f('estratos', 'Número de estratos', 'enum', ['Uno', 'Dos', 'Tres']),
        f('manejo_sombra', 'Manejo de la sombra', 'enum', [
          'Poda de árboles',
          'Corte selectivo de árboles',
          'Reforestación con spp nativas',
          'Introducción de spp exóticas',
        ], { multiple: true }),
        f('diversidad_especies', 'Diversidad de especies y cantidad aproximada', 'tabla', null, { columnas: DIVERSIDAD_COLS }),
        f(
          'cumple_sombra',
          'El manejo de sombra y los recursos hídricos cumplen con las normas internas de CASFA',
          'enum',
          CUMPLE,
        ),
      ],
    },
    {
      nombre: '5. Conservación del ecosistema',
      campos: [
        f(
          'protege_ecosistemas',
          'Realiza actividades para proteger, conservar y recuperar el bosque, la montaña y ecosistemas naturales.',
        ),
        f(
          'prohibido_talar',
          'Prohibición de talar, deforestar el bosque primario, causar daños al ecosistema natural.',
        ),
        f(
          'evidencia_deforestacion',
          'Existe evidencia de tala indiscriminada, deforestación, quema de montaña.',
        ),
        f('proteccion_recursos_hidricos', 'Protección de los recursos hídricos.'),
        f(
          'prohibicion_caceria',
          'Prohibición de la cacería. El productor está consciente que está prohibido la cacería, recolección, extracción y el tráfico de animales silvestres.',
        ),
      ],
    },
    {
      nombre: '6. Manejo del suelo y fertilidad',
      campos: [
        f('evidencia_erosion', '¿Encontró evidencias de erosión de suelo?'),
        f(
          'medidas_conservacion_suelo',
          '¿El productor toma medidas de conservación de suelos como corte de hierba alto, terrazas individuales, barreras físicas o barreras vivas establecidas a lo largo de las líneas de contorno a intervalos adecuados para las condiciones del sitio?',
        ),
        f('usa_estiercol', '¿El productor usa estiércol animal?'),
        f(
          'recicla_desechos_organicos',
          '¿Los desechos de procesamiento orgánico (cáscara, pulpa y cerezas no aceptables, sedimentos de las fosas) son reciclados en la parcela para producir abono de manera que no ejerza impacto negativo en el ambiente circundante?',
        ),
        f(
          'acumula_poda_hojas',
          '¿Los restos de la poda de árboles de sombra, hierbas y/o barreras vivas se acumulan sobre los suelos como enmiendas?',
        ),
        f(
          'capa_materia_organica',
          '¿Se conserva una capa de materia orgánica compuesta por hojas y biomasa a lo largo de las plantaciones de café de modo que contribuyan al ciclo nutritivo y la actividad biológica de los suelos?',
        ),
        f(
          'cumple_suelo',
          'El manejo de suelo, conservación, fertilidad y uso de insumos cumple con las normas internas de CASFA',
          'enum',
          CUMPLE,
        ),
      ],
    },
    {
      nombre: '7. Control de hierbas, plagas y enfermedades',
      campos: [
        f('deshierbes_por_anio', '¿Cuántos deshierbes se realizan por año?', 'number'),
        f(
          'uso_insumos_quimicos',
          '¿Encontró evidencias de uso de insumos químicos (herbicidas, insecticidas, fungicidas) para el control de hierbas, enfermedades, insectos o plagas en el cafetal (p.ej. aplicación de químicos contra broca u hormigas)?',
        ),
        f('problema_severo_plagas', '¿Hay algún problema severo de ataque de plagas o enfermedades?'),
        f('tipos_plaga', 'Tipo de plagas', 'enum', ['Roya', 'Broca', ...enumOtro], { multiple: true, opcion_otro: true }),
        f('metodo_combate', 'Métodos de combate', 'enum', ['Cultural', 'Químico'], { multiple: true }),
      ],
    },
    {
      nombre: '8. Riesgos de contaminación',
      campos: [
        f('riesgo_cultivos_colindantes', '¿Existe riesgo de contaminación por cultivos colindantes?'),
        f('sobre_que_almacena', '¿Sobre qué almacena sus sacos de café?', 'enum', ['Tarimas', 'Costales', ...enumOtro], { opcion_otro: true, multiple: true }),
        f(
          'areas_amortiguamiento',
          'Existen áreas de amortiguamiento que evitan contaminación por parcelas convencionales vecinas.',
        ),
        f('basura_plastico_cafetales', '¿Existe en los cafetales presencia de basura doméstica y plásticos?'),
      ],
    },
    {
      nombre: '9. Cosecha y postcosecha',
      campos: [
        f(
          'solo_fruto_maduro',
          'Únicamente se cortan frutos maduros; las cerezas de café que se encuentran en el suelo no se mezclan con las recolectadas del cafeto.',
        ),
        f(
          'riesgo_contaminacion_postcosecha',
          'Existe riesgo de contaminación de los productos orgánicos durante la cosecha, proceso o almacenamiento.',
        ),
        f('sistema_acopio', '¿Cuenta la operación con sistema de acopio?'),
        f(
          'mezcla_con_convencional',
          '¿Los productos orgánicos son mezclados/contaminados con productos convencionales durante el manejo postcosecha?',
        ),
      ],
    },
    {
      nombre: '10. Beneficio húmedo',
      campos: [
        f('equipo_beneficio_humedo', '¿El productor cuenta con equipo de beneficio húmedo?'),
        f('sitio_beneficio', '¿Dónde beneficia su café?', 'enum', ['Casa', 'Parcela', ...enumOtro], { multiple: true, opcion_otro: true }),
        f(
          'higiene_beneficio',
          '¿El beneficio húmedo cuenta con las medidas de higiene adecuadas? (despulpadoras, patios, fermentadora)',
        ),
        f('donde_seca', '¿Dónde seca su café?', 'enum', ['Patio de concreto', 'Malla de sombra', 'Costales', ...enumOtro], { opcion_otro: true, multiple: true }),
        f('fuente_agua', 'Fuente de agua limpia para uso en el despulpado, lavado y fermentación del café.', 'enum', [
          'Manantial',
          'Arroyo',
          'Toma doméstica',
        ], { multiple: true }),
        f(
          'control_acceso_animales',
          '¿El productor evita el acceso de animales y vehículos a las zonas de beneficio, secado y almacenamiento para evitar contaminación del producto?',
        ),
        f(
          'fosa_infiltracion',
          '¿El productor cuenta con una fosa de infiltración para evitar contaminación de fuentes de agua por residuos de cosecha y agua residual de uso en beneficio húmedo?',
        ),
      ],
    },
    {
      nombre: '11. Almacenamiento y transporte',
      campos: [
        f('almacen_exclusivo', '¿Cuenta con un almacén exclusivo y adecuado para el producto?'),
        f(
          'riesgo_mezcla_almacen',
          '¿Hay riesgos de mezcla o contaminación en el lugar donde el productor almacena su producto?',
        ),
        f(
          'limpieza_almacen',
          'El productor se asegura que el sitio donde se guarda el producto sea un lugar separado, seco y mantenga condiciones de limpieza adecuada.',
        ),
        f('insumos_quimicos_almacen', '¿Existe presencia de insumos químicos en el almacén doméstico del productor?'),
        f('plagas_almacen', '¿Existen plagas en el lugar de almacenamiento?'),
        f('combate_plagas_almacen', '¿Cómo se combaten las plagas?', 'text', null, mostrarSi('plagas_almacen')),
        f('transporte_centro_acopio', '¿Cómo se transporta el café desde la casa del productor hacia el Centro de Acopio?', 'enum', [
          'Carro de la empresa',
          'Transporte individual',
          'Otro medio',
        ], { multiple: true }),
        f('riesgo_mezcla_transporte', '¿Existe riesgo de mezcla o contaminación durante el transporte?'),
      ],
    },
    {
      nombre: '12. Bitácora',
      campos: [
        f('cuenta_con_bitacora', '¿Cuenta con bitácora?'),
        f('describe_actividades', 'Describe las actividades realizadas en su parcela', 'longtext'),
        f('observaciones_generales', 'Observaciones y/o comentarios', 'longtext'),
      ],
    },
    {
      nombre: 'Resultados de la evaluación',
      campos: [
        f('hallazgo_1', 'Hallazgo 1', 'text'),
        f('hallazgo_2', 'Hallazgo 2', 'text'),
        f('hallazgo_3', 'Hallazgo 3', 'text'),
        f('hallazgo_4', 'Hallazgo 4', 'text'),
        f('hallazgo_5', 'Hallazgo 5', 'text'),
        f('resultado_evaluacion', 'Resultado de la evaluación', 'enum', RESULTADO),
        f('fecha_revision', 'Fecha de revisión', 'date'),
        f('firma_productor', 'Firma del productor', 'signature'),
        f('firma_inspector', 'Firma del inspector', 'signature'),
        f('firma_comite', 'Firma del comité de aprobación', 'signature'),
      ],
    },
  ],
}

// ----------------------------------------------------------------------------
// FICHA TROPICALES
// ----------------------------------------------------------------------------
const TROPICALES = {
  tipo_cultivo: 'tropical',
  tipo_ficha: 'tropicales',
  nombre: 'Ficha Cultivos Tropicales',
  secciones: [
    {
      nombre: '2. Datos de ubicación de la unidad de producción',
      campos: [
        f('estatus_parcela', 'Estatus de la(s) parcela(s)', 'text'),
        f('pendiente', 'Pendiente', 'text'),
        f('tipo_suelo', 'Tipo de suelo', 'text'),
        f('drenaje', 'Drenaje', 'text'),
        f('anios_desde_establecimiento', 'Años desde que se estableció el cultivo', 'number'),
        f('otras_superficies', 'Otras superficies de la parcela además del cultivo', 'text'),
      ],
    },
    {
      nombre: '3. Riesgos de contaminación',
      campos: [
        f('sin_riesgo_8m', 'Clara, sin riesgo de contaminación a más de 8 mts.'),
        f('parcelas_convencionales_alejadas', 'Parcelas convencionales alejadas.'),
        f('franja_amortiguamiento', 'Establecimiento de franja de amortiguamiento.'),
        f(
          'evidencia_insumos_quimicos',
          'No se encontró evidencia de uso de insumos químicos (herbicidas, insecticidas, fungicidas) para el control de hierbas, enfermedades, insectos o plagas en el cultivo (p.ej. aplicación de químicos contra monilia u hormigas).',
        ),
        f(
          'riesgo_insumos_vecinos',
          '¿Existe riesgo de contaminación por parcelas vecinas por aplicación de insumos químicos o materiales prohibidos?',
        ),
        f('basura_plasticos', '¿Existe contaminación del cultivo por basuras domésticas y plásticos?'),
        f(
          'contaminacion_cuenca',
          '¿Existe contaminación del cultivo desde prácticas contaminantes en la cuenca hidrográfica?',
        ),
      ],
    },
    {
      nombre: '4. Diseño y conservación de la parcela',
      campos: [
        f('perimetro_delimitado', '¿Ha delimitado el perímetro de su parcela?'),
        f('con_que_delimito', '¿Con qué?', 'text'),
        f('diseno_interno_establecido', '¿Ha realizado un diseño interno para el establecimiento del cultivo?'),
        f('erosion_suelo', '¿Se erosiona el suelo de su parcela?'),
        f('inundacion_suelo', '¿Se inunda el suelo de su parcela?'),
        f(
          'practicas_conservacion',
          'Prácticas realizadas para evitar la erosión y garantizar estabilidad del cultivo',
          'longtext',
        ),
      ],
    },
    {
      nombre: '5. Vivero y siembra',
      campos: [
        f('cuenta_con_vivero_cultivo', '¿Cuenta con vivero del cultivo?'),
        f('variedad_cantidad_plantas', 'Variedad y cantidad de plantas', 'text'),
        f('semillas_de_la_parcela', '¿Las semillas del cultivo se obtienen de la misma parcela?'),
        f('insumos_en_viveros', '¿Usa insumos agroquímicos en los viveros?', 'text'),
        f('vivero_arboles_sombra', '¿Cuenta con vivero de árboles de sombra?'),
        f('resiembra', '¿Hizo resiembra del cultivo este año?', 'text'),
      ],
    },
    {
      nombre: '6. Manejo agroecológico del cultivo',
      campos: [
        f('manejo_sombra_diversificacion', 'Manejo de sombra y diversificación', 'longtext'),
        f('especies_maderables', 'Principales especies maderables', 'text'),
        f('cantidad_maderables', 'Cantidad de maderables', 'number'),
        f('deshierbe_con_machete', '¿Realiza el deshierbe o chapeo con machete?'),
        f('veces_deshierbe_por_anio', '¿Cuántas veces al año?', 'number'),
        f(
          'capa_materia_organica',
          '¿Se conserva una capa de materia orgánica compuesta por hojas y biomasa a lo largo de las plantaciones del cultivo de modo que contribuyan al ciclo nutritivo y la actividad biológica de los suelos?',
        ),
        f(
          'fertilizantes_no_permitidos',
          '¿Encontró evidencia de aplicaciones de fertilizantes no permitidos para la nutrición de la parcela?',
        ),
        f('elabora_aplica_abono_organico', '¿El productor elabora y aplica abono orgánico?'),
        f('tipo_de_abono', 'Si es sí, ¿qué tipo de abono?', 'text'),
      ],
    },
    {
      nombre: '7. Servicios ecosistémicos',
      campos: [
        f(
          'protege_conserva_ecosistemas',
          '¿Realiza actividades para proteger, conservar y recuperar el bosque, la montaña y ecosistemas naturales?',
        ),
        f(
          'areas_de_reserva',
          'El productor cuenta con áreas de reserva forestal que permiten el refugio de plantas y animales.',
          'text',
        ),
        f('evidencia_tala_deforestacion', 'Existe evidencia de tala indiscriminada, deforestación, quema de montaña.'),
        f(
          'proteccion_recursos_hidricos',
          'Protección de los recursos hídricos. El productor promueve el crecimiento de una franja de vegetación nativa a lo largo de las corrientes de agua para controlar la erosión, filtrar los agroquímicos y proteger el hábitat silvestre.',
        ),
        f('nuevas_areas_derriban_montana', '¿Las nuevas áreas de establecimiento de cultivos están derribando la montaña?'),
        f(
          'prohibicion_caceria_consciente',
          'Los cultivos certificados deben ser refugio para la vida silvestre. ¿El productor está consciente que está prohibido la cacería, recolección, extracción y el tráfico de animales silvestres?',
        ),
        f('condicion_del_cultivo', 'Evaluación de las condiciones productivas del cultivo', 'text'),
        f(
          'cumple_normas',
          'Las prácticas mecánicas, agronómicas y de fertilidad amigables con la biodiversidad cumplen con las normas internas de Flor de Pascuas',
          'enum',
          CUMPLE,
        ),
      ],
    },
    {
      nombre: '8. Cosecha y postcosecha',
      campos: [
        f('metodo_cosecha', '¿Cómo cosecha su producto?', 'text'),
        f('cacao_quiebre_recipiente', 'Para cacao: ¿cómo cosecha y quiebra sus mazorcas de cacao?', 'text'),
        f('venta_producto', '¿Cómo vende su producto?', 'text'),
        f('fermenta_cacao', 'En caso de vender cacao en seco: ¿cómo fermenta su cacao?', 'text'),
        f('cuenta_con_fosa_infiltracion', '¿Cuenta con fosa de infiltración?'),
        f('tipo_secado', 'Tipo de secado', 'text'),
        f('almacenamiento', '¿Cómo almacena su producto?', 'text'),
        f('transporte_centro_acopio', '¿Cómo transporta su producto hasta el centro de acopio?', 'text'),
      ],
    },
    {
      nombre: '9. Información de la producción anual',
      campos: [
        f('cultivo_1', 'Cultivo 1', 'text'),
        f('cantidad_1_kg', 'Cantidad 1 (kg)', 'number'),
        f('cultivo_2', 'Cultivo 2', 'text'),
        f('cantidad_2_kg', 'Cantidad 2 (kg)', 'number'),
        f('cultivo_3', 'Cultivo 3', 'text'),
        f('cantidad_3_kg', 'Cantidad 3 (kg)', 'number'),
      ],
    },
    {
      nombre: '10. Bitácora',
      campos: [
        f('cuenta_con_bitacora', '¿Cuenta con bitácora?'),
        f('describe_actividades', 'Describe las actividades realizadas en su parcela', 'longtext'),
        f('observaciones_comentarios', 'Observaciones y/o comentarios', 'longtext'),
      ],
    },
    {
      nombre: 'Resultados de la evaluación',
      campos: [
        f('hallazgo_1', 'Hallazgo 1', 'text'),
        f('hallazgo_2', 'Hallazgo 2', 'text'),
        f('hallazgo_3', 'Hallazgo 3', 'text'),
        f('hallazgo_4', 'Hallazgo 4', 'text'),
        f('hallazgo_5', 'Hallazgo 5', 'text'),
        f('fecha_revision', 'Fecha de revisión', 'date'),
        f('resultado_evaluacion', 'Resultado de la evaluación', 'enum', RESULTADO),
        f('firma_productor', 'Firma del productor', 'signature'),
        f('firma_inspector', 'Firma del inspector', 'signature'),
        f('firma_comite', 'Firma del comité de aprobación', 'signature'),
      ],
    },
  ],
}

async function seed() {
  const { data: org, error: orgErr } = await admin
    .from('organizaciones')
    .select('id')
    .eq('slug', 'casfa')
    .single()
  if (orgErr) throw orgErr
  const orgId = org.id

  // Desvincular fichas existentes de sus templates para no violar el FK al
  // borrar (las respuestas se conservan: van por nombre_interno, no por id).
  const { error: unlinkErr } = await admin
    .from('fichas')
    .update({ template_id: null })
    .eq('org_id', orgId)
    .not('template_id', 'is', null)
  if (unlinkErr) throw unlinkErr

  // Limpiar templates previos de la org (cascade borra secciones/campos).
  const { error: delErr } = await admin
    .from('form_templates')
    .delete()
    .eq('org_id', orgId)
  if (delErr) throw delErr

  // Mapa tipo_ficha -> id del nuevo template, para re-enlazar fichas al final.
  const tipoToTemplate = {}

  for (const form of [ROBUSTA, ARABE, TROPICALES]) {
    const { data: tpl, error: tErr } = await admin
      .from('form_templates')
      .insert({
        org_id: orgId,
        tipo_cultivo: form.tipo_cultivo,
        nombre: form.nombre,
        version: 1,
        activo: true,
      })
      .select('id')
      .single()
    if (tErr) throw tErr
    tipoToTemplate[form.tipo_ficha] = tpl.id

    let sOrden = 0
    let totalCampos = 0
    for (const sec of form.secciones) {
      const { data: seccion, error: sErr } = await admin
        .from('form_secciones')
        .insert({ template_id: tpl.id, nombre: sec.nombre, orden: sOrden++ })
        .select('id')
        .single()
      if (sErr) throw sErr

      const campos = sec.campos.map((c, i) => ({
        seccion_id: seccion.id,
        nombre_interno: c.nombre_interno,
        etiqueta: c.etiqueta,
        tipo: c.tipo,
        opciones: c.opciones,
        requerido: false,
        orden: i,
        config: c.config ?? {},
      }))
      const { error: cErr } = await admin.from('form_campos').insert(campos)
      if (cErr) throw cErr
      totalCampos += campos.length
    }
    console.log(`✓ ${form.nombre}: ${form.secciones.length} secciones, ${totalCampos} campos`)
  }

  // Re-enlazar fichas existentes al template nuevo de su tipo.
  for (const [tipo, templateId] of Object.entries(tipoToTemplate)) {
    const { error: relErr } = await admin
      .from('fichas')
      .update({ template_id: templateId })
      .eq('org_id', orgId)
      .eq('tipo', tipo)
    if (relErr) throw relErr
  }

  console.log('\nSeed de formularios completado.')
}

seed().catch((e) => {
  console.error('ERROR seed:', e.message ?? e)
  process.exit(1)
})
