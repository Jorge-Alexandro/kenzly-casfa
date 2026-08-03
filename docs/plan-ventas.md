# Ventas — flujo y plan

Plan de trabajo del módulo Ventas (CASFA), derivado de la reunión con Diego Iván
y del contenido real de `CASFA SIC FILES/VENTAS/`.

---

## 0. Punto de partida (lo que ya existe y lo que no)

El módulo Ventas **ya está construido** (migración `0018_ventas.sql`): tablas
`ventas_cliente`, `ventas_producto`, `ventas_factura`, `ventas_detalle`,
`ventas_stock`, `ventas_precio_cliente`, importador de CFDI (XML), captura
manual, reporte producto×mes y export CSV. El CRM también (`0022_crm.sql`).

Lo que **no** existe todavía es la carga de los datos reales:

| Tabla | Filas hoy | Debería tener |
|---|---|---|
| `ventas_producto` | 71 | 71 ✔ (ya cargado, con `kg_por_unidad` correcto) |
| `ventas_cliente` | **1** | ~46 (40 con RFC real + público + los de exportación) |
| `ventas_factura` | **1** | 279 (ene–abr 2026) |
| `ventas_detalle` | 53 | el desglose de esas 279 |
| `ventas_stock` | **0** | 71 (inventario inicial) |
| `crm_cuenta` | **0** | las cuentas de los clientes reales |

**Conclusión:** casi nada de este plan es "construir el módulo desde cero". Es
(a) cargar lo real, (b) corregir dos defectos de fondo que se detectaron al
revisar los archivos, y (c) las funciones nuevas que se pidieron.

---

## 1. Hallazgos al revisar los archivos reales

### 1.1 El reporte de Excel calcula mal los kilos (defecto real, afecta compras)

En `Reporte de ventas 2026 - ENE ABR.xlsx`, la columna **"Kilogramos
Procesados"** tiene la fórmula `=Z/2` en **todas** las filas — es decir, divide
la cantidad de piezas entre 2 sin importar la presentación. Y "Kilogramos
Materia Prima" es `=AB*1.25` encima de ese número ya equivocado.

Sólo es correcto para la presentación de 500 g. Para todas las demás está mal,
en ambas direcciones:

| Producto | Piezas | Kg reales | Kg en el Excel | Error |
|---|---:|---:|---:|---|
| BOLSA KRAFT (908 g) | 4 700 | 4 267.6 | 2 350 | **−45 %** |
| BOLSA (340 g) | 670 | 227.8 | 335 | +47 % |
| IGUANA SANA (454 g) | 150 | 68.1 | 75 | +10 % |
| KRAFT (1 kg) | 115 | 115 | 57.5 | −50 % |
| KRAFT (250 g) | 1 | 0.25 | 0.5 | +100 % |
| BOLSA (500 g) | 40 | 20 | 20 | ✔ |

El 908 g es el producto #1 (≈ $932 600 de $1.25 M): está subestimado en
~1 900 kg de café. Como ese número se multiplica por 1.25 para planear materia
prima, el error se propaga a las compras.

**La app ya lo hace bien.** `ventas_producto.kg_por_unidad` está poblado
correctamente por presentación (0.227, 0.34, 0.454, 0.908, …) y el reporte
calcula `cantidad × kg_por_unidad`. Al migrar al sistema esto se corrige solo;
lo que hay que hacer es **mostrar la tabla de conversión** para que sea
auditable y editable (petición del tabulador de piezas).

### 1.2 Los 71 CFDI de exportación colapsarían en un solo cliente (bloqueante)

`ventas_cliente` tiene `unique (org_id, rfc)`. Los clientes extranjeros no
tienen RFC mexicano: todos usan el genérico **`XEXX010101000`**. En el archivo
real hay **71 facturas de exportación (25 % del total)** repartidas entre al
menos 6 empresas distintas:

- RUTA MAYA IMPORTING Ltd
- ROYAL COFFEE INC
- BIJDENDIJK COFFEE IMPORT & EXPORT
- MEO-FICHAUX SAS
- Leafy Beans Coffee LLC
- (+ variantes)

Con el esquema actual las 71 se juntarían en **un solo "cliente
XEXX010101000"**, y el KPI de *top ventas por cliente* — justo lo que se
pidió — saldría inservible para toda la exportación. Lo mismo con
`XAXX010101000` (67 facturas de público en general).

**Hay que romper esa unicidad antes de cargar nada.** Ver Fase 1.

### 1.3 La suciedad está en los nombres, no en los RFC

Buena noticia para el pedido de "limpieza/ML":

- Los **40 clientes con RFC real tienen exactamente un nombre cada uno** — cero
  duplicados. No hace falta ML ahí.
- **77 de 279 RFC traen espacios al inicio/final** (`"AET160921SE3 "`) — basura
  de captura, se arregla con `trim()`.
- Los duplicados reales están **sólo dentro de los dos RFC genéricos**, y son
  variantes de escritura del nombre:
  - `PUBLICO EN GENERAL` vs `VENTAS AL PUBLICO`
  - `BIJDENDIJK  COFFEE…` (doble espacio) vs `BIJDENDIJK COFFEE…`
  - `MEO-FICHAUX SAS` vs `Meo Fichaux SAS`

**Recomendación:** para esto **no se necesita machine learning**. Un
normalizador determinista (mayúsculas, sin acentos, espacios colapsados, sin
`SA DE CV`/`S.A.`/`LLC`/`Ltd`, comparación por similitud) resuelve el 100 % de
los casos observados, es explicable, auditable y no inventa. Es el mismo patrón
que ya se usó para ligar comunidades en Agroecología, donde la regla es: **si
hay más de un candidato, no se une solo — se manda a revisión.** Un modelo que
"adivine" fusiones de clientes puede juntar dos empresas distintas y corromper
la facturación; el costo de un falso positivo es mucho mayor que el de revisar
a mano tres casos.

Si más adelante el volumen lo amerita, el mismo punto de enganche (la bandeja
de revisión) admite un modelo — pero empezar por ahí sería resolver con ML un
problema que es de captura.

### 1.4 Cómo se deriva nacional vs exportación (sin capturarlo a mano)

El propio RFC lo dice, no hace falta que nadie lo teclee:

| RFC receptor | Significa | Facturas |
|---|---|---:|
| `XEXX010101000` | Extranjero → **exportación / comercio exterior** | 71 |
| `XAXX010101000` | Público en general (nacional, sin datos fiscales) | 67 |
| cualquier otro | Cliente nacional con RFC | 141 |

Además el CFDI de exportación trae el nodo **`cfdi:ComercioExterior`** y
`Comprobante@Exportacion`, que es la fuente autoritativa. Se usa el nodo cuando
existe y el RFC como respaldo.

---

## 2. El flujo objetivo

```
                    ┌───────────────────────────────┐
                    │ 1. CRM: prospecto → cotización│
                    │    (cliente nuevo o existente)│
                    └───────────────┬───────────────┘
                                    │ se gana la oportunidad
                                    ▼
                    ┌───────────────────────────────┐
                    │ 2. Alta de cliente automática │
                    │    CRM  →  ventas_cliente     │
                    │    (RFC real, o venta público)│
                    └───────────────┬───────────────┘
                                    ▼
   ┌────────────────────────────────────────────────────────────┐
   │ 3. VENTA                                                   │
   │    a) Captura manual (Diego) — descuenta inventario        │
   │    b) CFDI del SAT (XML + PDF) — doña Juani factura         │
   │       · nacional / comercio exterior: se detecta solo      │
   │       · concepto: catálogo fijo (copiar y pegar)           │
   └───────────────┬────────────────────────────────────────────┘
                   │
                   ├──► 4. Limpieza y dedup ──► bandeja de revisión
                   │
                   ├──► 5. INVENTARIO (pestaña aparte)
                   │       salidas: venta · regalía/cortesía · merma · ajuste
                   │
                   └──► 6. REPORTE
                           · producto × mes (piezas + kilos correctos)
                           · top clientes · top línea · top producto
                           · nacional vs exportación
                           · gráficos
```

**Estados de una factura** (resuelve el caso "Mara Bernal"):

```
  borrador ──► timbrada ──► pagada
                  │
                  ├──► cancelada   (no pagó / llegó mal / se dio de baja)
                  └──► nota de crédito (descuento parcial, con motivo)
```

El ejemplo de la reunión —se factura el 7, se carga el 15, llega el 27, no se
paga, se cancela— exige que la factura tenga **fecha de emisión, fecha de carga
y fecha de cobro por separado**, y que cancelar **revierta el descuento de
inventario**. Hoy sólo hay `estado: vigente|cancelada` sin fechas ni reversa.

---

## 3. Fases

Ordenadas por dependencia: cada una deja el sistema utilizable.

### Fase 1 — Cimientos: modelo de cliente y carga real  ⬅ empezar aquí
*Bloquea a todas las demás.*

- Migración: quitar `unique (org_id, rfc)`; agregar a `ventas_cliente`
  `tipo_cliente` (`nacional` | `exportacion` | `publico`), `pais`,
  `nombre_normalizado`. Nueva unicidad: `(org_id, rfc, nombre_normalizado)` para
  que los genéricos convivan.
- Normalizador determinista de nombres (`lib/ventas/normalizar.mjs`, puro y
  testeable), reutilizable por el importador y por la bandeja de dedup.
- Importador `scripts/import-ventas-clientes.py`: 279 filas → ~46 clientes,
  con reporte de qué unió y qué mandó a revisión. Idempotente.
- Corregir los 77 RFC con espacios.

**Entregable:** los clientes reales cargados y clasificados nacional/exportación.

### Fase 2 — Rol Ventas y acceso
- Migración `rol = 'ventas'` (mismo patrón que `0047_rol_operativo.sql`).
- `lib/acceso.ts`: `VENTAS = ['ventas', 'inventario', 'crm']`.
- Alta de Diego Iván (`ventas@redcasfa.com`).
- RLS: sin acceso a costos ni márgenes de acopio (igual que `operativo`).
- Filtro "sólo mis cuentas" / responsable = ventas en el listado de CRM.

**Entregable:** Diego entra y ve exactamente sus tres módulos.

> Nota: al construir Agroecología se encontró que `agroecologia` nunca estuvo en
> la matriz de `lib/acceso.ts`. Todo módulo nuevo debe agregarse ahí o queda
> invisible aunque el código esté bien.

### Fase 3 — Conversión piezas↔kilos y catálogo de conceptos
- Página **Tabulador**: tabla editable `producto → unidad, gramaje,
  kg_por_unidad`, con validación contra el nombre (si dice `(908g)` y
  `kg_por_unidad ≠ 0.908`, se marca).
- Comparativo contra el Excel viejo para que se vea el ajuste (§1.1) y nadie
  piense que "el sistema da otro número".
- **Catálogo de conceptos de facturación** exportable a Excel/PDF para doña
  Juani: lista fija, en mayúsculas, para copiar y pegar. Es la raíz del problema
  de duplicados: si el concepto sale del catálogo, no hay nada que limpiar
  después.

**Entregable:** los kilos cuadran y la facturación tiene de dónde copiar.

### Fase 4 — Importación de facturas (XML + PDF) y ciclo de vida
- Importar **PDF** además de XML (ya existe el patrón en Contabilidad, que lee
  CFDI en PDF; se reutiliza `lib/cfdi/extraer.mjs`).
- Carga por lote (el paquete mensual que baja doña Juani).
- Detección **comercio exterior vs nacional** (§1.4), visible como sello en la
  factura.
- Estados + fechas: emisión / carga / cobro; **cancelar revierte inventario**.
- **Nota de egresos / crédito** con motivo libre ("descuento porque llegó mal").
- Venta al público sin datos fiscales.

**Entregable:** el ciclo real de la factura, incluido el caso Mara Bernal.

### Fase 5 — Inventario (pestaña aparte)
- `ventas_movimiento`: `venta | regalia | cortesia | merma | ajuste | entrada`,
  con motivo y responsable.
- Inventario en vivo de producto terminado (mismo patrón que el inventario vivo
  de maquila ya construido, incluidas las alertas de negativo).
- Enlace con las salidas de almacén de Axel → destino **torrefacción** y
  cliente, desde catálogo, no texto libre (petición explícita de la reunión).

**Entregable:** inventario propio, separado de Ventas, con mermas y cortesías.

### Fase 6 — Reporte con gráficos y KPIs por cliente
- **Top ventas por cliente** (lo que se pidió) + participación % por cliente.
- Nacional vs exportación, por mes.
- Valor ($) vs volumen (kg) por línea — ya existe `porLinea()`, falta graficarlo.
- Ver **todas** las ventas sin límite, con filtros y export.
- Gráficos dentro del reporte.

**Entregable:** el reporte del Excel, pero correcto y sin mantenerlo a mano.

### Fase 7 — CRM: cotización y alta automática
- **Cotización** en PDF desde una oportunidad (cliente nuevo o existente),
  con los precios acordados del cliente.
- Botón **"convertir en cliente"**: `crm_cuenta` → `ventas_cliente`.
- Campo **nacional / exportación** en la cuenta (hereda del cliente fiscal).
- Participación de cada cliente en las ventas, dentro de la ficha 360°.

**Entregable:** el ciclo completo prospecto → cotización → cliente → factura.

---

## 4. Fuera de alcance por ahora

**Actualización 2026-08-03:** "Requisiciones digitales en PDF" ya SÍ se construyó
— CASFA proporcionó el formato real (`Formato de Requisicion.xlsx`) y la Tabla
de Equivalencias oficial (confirma exactamente el `kg_por_unidad` ya cargado en
la Fase 3). Ver `/ventas/requisiciones`: orden interna de producción para
torrefacción (producto, cantidad, kg equivalente — sin costos, el viejo formato
tenía columnas de costo confusas y sin usar), folio consecutivo, PDF con firmas
Solicitó/Autorizó/Entregó, no descuenta inventario.

Salieron en la reunión pero siguen sin ser de este módulo:

- **Computadora/escáner en planta** (compra, no software).
- **Nombres comerciales de los cafés** (Iguana Sana, Solkín, a granel) —
  pendiente de la plática con Claudio; el catálogo de productos ya soporta el
  cambio de nombre cuando se decida.

---

## 5. Decisiones que hacen falta

1. **¿Por dónde empezar?** El orden propuesto es 1 → 2 → 3, pero si Diego
   necesita entrar ya, la Fase 2 puede ir primero (es independiente).
2. **Los 6 clientes de exportación**: ¿se manejan como clientes con nombre
   propio (recomendado, y necesario para el KPI) o agrupados como "exportación"?
3. **Inventario inicial**: ¿de dónde sale el arranque de los 71 productos? Sin
   eso el inventario nace en negativo (como ya pasa en maquila).
4. **Histórico**: ¿se carga sólo 2026 ene–abr, o también los años anteriores si
   existen los archivos?
