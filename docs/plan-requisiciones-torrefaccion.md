# Requisiciones y Torrefacción — plan de los acuerdos

Plan derivado de la sesión sobre alineación operativa entre las líneas de café
y cacao (consecutivos, firmas y stock mínimo en Torrefacción).

Estado al **2026-08-04**.

---

## Resumen: qué ya está y qué falta

| Acuerdo | Estado |
|---|---|
| 1. Consecutivo unificado desde 1 | **Hecho** |
| 2. Firma híbrida (imprimir → firmar → archivar) | **Parcial** — el PDF ya sirve; falta el seguimiento |
| 3. Safety stock 20 sacos + alerta 10-15 | **Bloqueado por un hueco de datos** (ver §3) |

---

## 1. Consecutivo unificado desde 1 — HECHO

**Lo que se acordó:** un solo consecutivo para café y cacao, arrancando en 1.

**Ya quedó así**, y de hecho la unificación era gratis: el folio de requisición
nunca estuvo separado por línea. Vive en `ventas_requisicion_contador`, es
**uno por organización** y lo asigna un trigger transaccional (mismo patrón que
los folios de asistencia). Café y cacao comparten la misma serie por diseño —
no hay nada que "unificar" porque nunca se dividió.

**Lo que sí hubo que corregir:** el contador se había quedado en 3 por capturas
de prueba (dos mías al verificar, más una que se capturó desde la pantalla).
Ya se limpiaron esos registros y **el contador quedó en 0: la próxima
requisición real sale con folio `0001`**.

Se verificó que la limpieza no tocó nada real: los 53 renglones del histórico de
ventas 2026 siguen intactos, y el inventario se repuso solo (el −2 kg que había
dejado la venta de prueba volvió a 0).

El archivo histórico en papel queda independiente, como se acordó.

---

## 2. Firma híbrida — PARCIAL

**Lo que se acordó:** el sistema genera la requisición → se imprime → se recaba
firma autógrafa (Ing. Toño) → se deja copia física en la estación.

**Lo que ya sirve:** el PDF de requisición ya se genera con las tres líneas de
firma (Solicitó / Autorizó / Entregó) y es imprimible tal cual. El flujo
híbrido se puede operar **hoy mismo** sin cambios.

**Lo que falta — el seguimiento.** Hoy una requisición sólo "existe": no hay
forma de saber si ya se imprimió, si Toño ya la firmó, o si ya volvió la copia.
Con varias requisiciones a la semana, eso se vuelve el problema real (no la
firma en sí).

**Propuesta:**

- **Estado de la requisición**: `borrador → impresa → firmada`, con fecha y
  quién la marcó. Es un campo y dos botones — barato y resuelve el "¿ésta ya
  se entregó?".
- **Evidencia opcional**: subir foto o escaneo de la copia firmada. Ya existe
  ese patrón funcionando (las fotos de talleres de Agroecología suben a
  Storage), así que sería reutilizar, no inventar.

**Fase 2 (tablet)**: cuando llegue el dispositivo, capturar la firma en
pantalla. Tampoco hay que inventarlo — la firma en canvas ya existe y funciona
en Asistencia y en Contratos (firma remota por liga). Sería conectar lo que ya
está.

---

## 3. Safety stock en Torrefacción — HAY UN HUECO QUE RESOLVER PRIMERO

**Lo que se acordó:** mantener 20 sacos de seguridad en Torrefacción y alertar
cuando baje a 10-15 para reabastecer desde el almacén de beneficio.

### El hallazgo

El sistema **sabe cuánto entra** a Torrefacción pero **no sabe cuánto sale**.

Hoy, cada corte de maquila registra cuántos sacos se mandaron a torrefacción
(campo `sacos_torrefaccion` en el cuadre). Con datos reales:

| Corte | Fecha | Especie | Sacos a torrefacción |
|---|---|---|---:|
| M-14 | 2026-05-19 | ARABE | 20 |
| M-16 | 2026-06-09 | ROBUSTA | 10 |
| M-17 | 2026-07-02 | ARABE | 20 |
| | | **Total** | **50** |

Pero **no existe ningún registro de lo que Torrefacción consume** al tostar.
Cero. El café entra y desaparece del sistema; el producto terminado reaparece
después, capturado a mano.

**Consecuencia directa:** si hoy calculáramos el saldo de Torrefacción, sólo
podría subir — nunca bajaría. La alerta de "menos de 10-15 sacos" **jamás se
dispararía**. Sería una alerta que da falsa tranquilidad, que es peor que no
tenerla: el área se quedaría sin café *y el sistema diría que hay 50 sacos*.

Por eso este acuerdo no es "configurar un parámetro": falta el dato de origen.

### Lo que hay que construir, en orden

**3a. Registro de tueste** — el que cierra el hueco.
Cuando Toño tuesta: cuántos sacos de café oro entraron y qué producto
terminado salió. Es el eslabón que hoy falta entre el corte de maquila y el
inventario de producto terminado.

Cierra **dos** huecos de una vez:
- permite el saldo real de Torrefacción → la alerta puede funcionar;
- hoy el producto terminado entra al inventario **a mano** (hay 0 movimientos
  de tipo `entrada` registrados). Con el tueste capturado, entraría solo.

**3b. Saldo de Torrefacción**: entradas (cortes de maquila) − consumo (tueste).
Cálculo puro, sin tabla nueva — mismo enfoque que el inventario en vivo de
maquila, que ya funciona así.

**3c. Parámetro de stock mínimo**: 20 sacos por default, **configurable** (se
acordó "o según la demanda de la semana", así que no puede quedar quemado en el
código) y el umbral de alerta (10-15).

**3d. Alerta visible**: semáforo verde/amarillo/rojo, mismo patrón que el
semáforo de cobranza que ya está funcionando en Ventas.

### Decisión pendiente

¿La alerta es **sólo visible en pantalla** o también **notificación automática**?

El panel visual no necesita infraestructura nueva y se puede hacer junto con
3b/3c. La notificación automática (correo/WhatsApp sin que nadie entre a
revisar) sí necesita pieza nueva: tarea programada + servicio de envío. Es la
misma decisión que ya se tomó en cobranza, donde se eligió el panel visual
primero.

---

## 4. Además: opción de borrar lo capturado

Fuera de los tres acuerdos, se agregó lo que se pidió al detectar los datos de
prueba: **poder borrar lo que se captura**.

Ya quedó en:
- **Ventas capturadas** — borra la venta con sus pagos y facturas, y repone el
  inventario (la confirmación lo advierte antes).
- **Requisiciones** — borra el folio.
- Pagos, facturas y movimientos de inventario ya lo tenían.

**Borrar** y **cancelar** siguen siendo cosas distintas a propósito: cancelar
deja el registro con su motivo (es historia: "esta venta existió y se cayó");
borrar lo quita como si nunca hubiera existido (es para corregir una captura
equivocada). Los dos reponen inventario.

**Pendiente**: en el CRM (cuentas, oportunidades, contactos, actividades)
todavía no hay opción de borrar. Es la única parte capturable que queda sin
ella, y conviene revisarla aparte porque borrar una cuenta con historial de
ventas vinculado no es lo mismo que borrar una venta de prueba.

---

## 5. Acuerdos de la sesión — estado

| # | Acción | Estado |
|---|---|---|
| 1 | Consecutivo unificado desde 1 | **Hecho** (folio 0001 en la próxima) |
| 2 | Formato físico impreso para firmas | **Ya se puede operar** (PDF listo); falta seguimiento de estado |
| 3 | Safety stock 20 sacos + alerta 10-15 | **Requiere 3a primero** (registro de tueste) |
| 4 | Tablets para firma digital | Fase 2 — el componente de firma ya existe y se reutiliza |
