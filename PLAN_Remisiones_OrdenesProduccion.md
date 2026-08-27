# Plan — Remisiones de Cosecha y Órdenes de Producción

**Módulo:** Cosecha (SIGA-DDI) · **Fecha:** 8-jul-2026 · **Estado:** Para aprobación (aún sin código)

---

## 1. Resumen del análisis de la arquitectura existente

**Stack real:** NestJS + Prisma + PostgreSQL. Frontend React + Vite + Tailwind. Auth JWT (access en memoria + refresh cookie). Multitenant por columna `tenant_id`; el tenant efectivo se resuelve con el decorador `@TenantId()` (del token para usuarios normales; header `X-Tenant-Id` para SUPER_ADMIN) y `requireTenant()`. Roles vía `@Roles()` + `RolesGuard` global. La API **no usa prefijo `/api`** (rutas al estilo `/harvest-records`), así que adaptaré las rutas a esa convención. Migraciones = carpetas SQL en `prisma/migrations`. Tablas/columnas en snake_case vía `@map`.

**Lo que ya existe y usaré:**

| Concepto | Cómo está hoy |
|---|---|
| Registro de cosecha | `harvest_records`: `tenant_id`, `farm_id`, `fecha` (DATE), `worker_id`, `quality_id`, `lot_id`, `variedad` (snapshot), `peso_bruto_gramos`, `peso_total_recipientes_gramos`, `gramos_cosechados`, `status` (`ACTIVE`/`CANCELLED`), `created_by`, timestamps |
| Recipientes por registro | `harvest_record_containers`: `harvest_record_id`, `container_id`, `unidades`, `peso_unitario_gramos`, `peso_total_gramos` |
| Calidad | `qualities` (`quality_id` en el registro) |
| Lote / Finca | `lots` (`farm_id`, `variedad`), `farms` (ambas con `tenant_id`) |
| Estado válido | `status = ACTIVE` (los `CANCELLED` se excluyen; no hay borrado físico) |
| Roles | `SUPER_ADMIN`, `ADMIN_TENANT`, `OPERADOR_COSECHA`, `LECTOR` |

**Vacíos detectados (no existen hoy — se crearán):**

1. **Peso en kilogramos / tipo decimal:** el sistema guarda **gramos como enteros** (exacto, sin float). No hay `Decimal` ni kg. → *Decisión 2.*
2. **Cantidad de canastillas:** **no se almacena** una cantidad de "canastillas cosechadas". Lo más cercano es `harvest_record_containers.unidades` (unidades de recipiente pesadas). En el seed los recipientes se llaman "Canastilla pequeña/grande" y "Balde". → *Decisión 1 (crítica).*
3. **Consecutivos / secuencias:** no existe tabla ni numeración de documentos. → *Decisión 4.*
4. **Auditoría / IP:** no hay tabla de auditoría ni captura de IP. → crearé un historial mínimo de eventos (`document_events`).
5. **Rol de Postcosecha/Receptor:** no existe. Recepción/aceptación deberá mapearse a los roles actuales. → *Decisión 3.*
6. **Pruebas:** el proyecto **no tiene** configuración de tests (ni Jest ni `*.spec`). Se añadirá un harness mínimo.

> Regla que respeto: no inventar reglas de negocio deducibles del código. Por eso las 4 decisiones al final requieren tu confirmación.

---

## 2. Modelo de datos propuesto (Prisma, adaptado a las convenciones actuales)

Nuevos enums: `RemissionStatus { PENDIENTE_RECEPCION, RECIBIDA, ANULADA }`, `ProductionOrderStatus { PENDIENTE_ACEPTACION, ACEPTADA, ANULADA }`, `DocumentType { REMISSION, PRODUCTION_ORDER }`, `DocumentEventType { CREATED, RECEIVED, ACCEPTED, DUPLICATE_ATTEMPT, STATUS_CHANGE }`.

**Remisiones**
- `harvest_remissions` (cabecera): `id`, `tenant_id`, `farm_id`, `lot_id`, `fecha`, `sequence_number`, `document_number`, `status`, `total_peso_gramos`, `total_canastillas`, `registros_incluidos`, `created_by`, `created_at`, `received_by?`, `received_at?`, `received_peso_gramos?`, `received_canastillas?`, `updated_at`, `version` (lock optimista). **Único parcial `(tenant_id, fecha, lot_id)` para estados no anulados.**
- `harvest_remission_details` (por calidad): `id`, `remission_id`, `quality_id`, `peso_gramos`, `canastillas`.
- `harvest_remission_sources` (trazabilidad a registros): `id`, `remission_id`, `harvest_record_id`, `peso_gramos_snapshot`, `canastillas_snapshot`, `quality_id_snapshot`. Único `(remission_id, harvest_record_id)`.

**Órdenes de producción**
- `production_orders` (cabecera): `id`, `tenant_id`, `farm_id`, `fecha`, `sequence_number`, `document_number`, `status`, `total_peso_gramos`, `total_canastillas`, `lotes_incluidos`, `registros_incluidos`, `created_by`, `created_at`, `accepted_by?`, `accepted_at?`, `accepted_peso_gramos?`, `accepted_canastillas?`, `updated_at`, `version`. **Único parcial `(tenant_id, fecha, farm_id)` para estados no anulados.**
- `production_order_quality_details`: `id`, `production_order_id`, `quality_id`, `peso_gramos`, `canastillas`.
- `production_order_lot_details`: `id`, `production_order_id`, `lot_id`, `peso_gramos`, `canastillas`.
- `production_order_sources`: `id`, `production_order_id`, `harvest_record_id`, `peso_gramos_snapshot`, `canastillas_snapshot`, `lot_id_snapshot`, `quality_id_snapshot`.
- `production_order_remissions` (traza opcional orden↔remisión): `production_order_id`, `remission_id`.

**Consecutivos y auditoría**
- `document_sequences`: `id`, `tenant_id`, `document_type`, `farm_id?`, `prefix`, `year?`, `current_number`, `padding_length`, `active`, `created_at`, `updated_at`. Único `(tenant_id, document_type, farm_id, year)`.
- `document_events` (auditoría): `id`, `tenant_id`, `document_type`, `document_id`, `event`, `previous_status?`, `new_status?`, `user_id`, `created_at`, `metadata` (JSON).

Todas las tablas llevan `tenant_id` e índices por los filtros usados (`tenant_id, fecha`, `tenant_id, farm_id`, `status`, `document_number`). Claves foráneas a `farms`, `lots`, `qualities`, `harvest_records`, `users`.

---

## 3. Relación remisión ↔ orden (decisión de diseño)

**Elegido:** la **orden de producción se genera directamente de los registros de cosecha** válidos del día/finca (fuente autoritativa de totales), y **enlaza** las remisiones existentes de ese día/finca solo para trazabilidad (`production_order_remissions`). Así:
- No se exige que existan remisiones para poder crear la orden.
- No se cuentan dos veces registros (los totales salen de `harvest_records`, no de sumar remisiones).
- La orden conserva trazabilidad hasta finca → lotes → remisiones asociadas → registros originales.

---

## 4. Reglas de negocio y cálculo

- **Registros válidos:** `tenant_id` = tenant efectivo, `fecha` = filtro, `lot_id`/`farm_id` = filtro, `status = ACTIVE`, `quality_id` válido, peso `> 0`. Si hay registros inconsistentes → **se bloquea la creación** y se informan cuáles.
- **Totales (backend, nunca del frontend):** peso total = Σ `gramos_cosechados` de los registros incluidos; canastillas = Σ según *Decisión 1*; detalle por calidad = agrupado por `quality_id`; en órdenes, además resumen por `lot_id`. Se valida que Σ detalles == total antes de confirmar la transacción.
- **Snapshot:** los totales y el detalle se guardan al crear; **no se recalculan** al consultar. Si luego cambian los registros, el documento no cambia.
- **Precisión:** peso en **gramos enteros** (exacto, coherente con el sistema). El kg se deriva para mostrar (÷1000). *(o Decimal según Decisión 2).*

---

## 5. Endpoints (adaptados a la convención actual, sin `/api`)

**Remisiones:** `GET /harvest-remissions/preview?date&lotId` · `POST /harvest-remissions` `{date, lotId}` · `GET /harvest-remissions` (filtros + paginación) · `GET /harvest-remissions/:id` · `POST /harvest-remissions/:id/receive`.

**Órdenes:** `GET /production-orders/preview?date&farmId` · `POST /production-orders` `{date, farmId}` · `GET /production-orders` · `GET /production-orders/:id` · `POST /production-orders/:id/accept`.

**Consecutivos (config):** `GET /document-sequences` · `POST /document-sequences` · `PATCH /document-sequences/:id` (para fijar prefijo, padding y número inicial).

El backend **recalcula** todo; ignora totales, `tenant_id`, `created_by`, `received_by`, `accepted_by` enviados por el cliente (se toman de `@CurrentUser()` / `@TenantId()`).

---

## 6. Concurrencia y duplicados

- **Duplicado al crear:** índice único `(tenant, fecha, lote)` / `(tenant, fecha, finca)` → segundo intento devuelve error controlado 409 ("ya existe...").
- **Recibir/Aceptar (atómico):** `UPDATE ... SET status=RECIBIDA/ACEPTADA, received_by/accepted_by=... WHERE id=? AND status=PENDIENTE...` dentro de transacción; si afecta 0 filas → ya fue recibida/aceptada → 409. Refuerzo con `version` (lock optimista).
- **Consecutivo seguro:** dentro de la misma transacción, incremento atómico `UPDATE document_sequences SET current_number = current_number + 1 ... RETURNING current_number` (nada de `MAX+1`). `document_number` único por tenant.
- Cada operación deja registro en `document_events` (incluye intentos duplicados).

---

## 7. Permisos (mapeados a los roles actuales)

Propuesta (ver *Decisión 3*): **consultar** = todos los roles (dentro de su tenant); **crear** remisión/orden = `OPERADOR_COSECHA`, `ADMIN_TENANT`, `SUPER_ADMIN`; **recibir/aceptar** = `ADMIN_TENANT`, `SUPER_ADMIN`; **configurar consecutivos** = `SUPER_ADMIN`. Aislamiento por tenant en cada consulta.

---

## 8. Frontend (dentro de Cosecha, reutilizando componentes actuales)

Sub-navegación en el área de Cosecha: **Registros · Remisiones · Órdenes de producción**. Pantallas de Remisiones y Órdenes con: filtros (fecha, finca/lote), botón "Vista previa", resumen general + tabla por calidad (y por lote en órdenes), botón "Crear" con **modal de confirmación de totales**, listado histórico con estado/consecutivo/usuarios/fechas, detalle, y acción Recibir/Aceptar (solo si aplica y hay permiso). Botones deshabilitados durante la solicitud (anti doble-clic), errores del backend claros, refresco tras cada acción. Reutiliza `Table`, `Modal`, `Button`, `Toggle`, tokens de color y el patrón responsive ya corregido (`min-w-0`).

---

## 9. Migraciones y pruebas

- **Migraciones:** nuevas carpetas SQL (crean tablas, enums, FKs, índices y únicos). No tocan datos existentes ni eliminan columnas. Seed opcional para inicializar `document_sequences` con el número inicial de la finca.
- **Pruebas:** se añadirá Jest (hoy no hay). Unitarias para: agrupación por calidad, sumas, exclusión de otros tenants, exclusión de anulados, dedup, asignación de consecutivo, recepción/aceptación e idempotencia (bloqueo de duplicados). Integración/concurrencia real requieren un Postgres de pruebas; se dejarán listas y documentadas (y pruebas manuales paso a paso).

---

## 10. Riesgos / supuestos

- La definición de "canastillas" es el mayor riesgo de negocio (Decisión 1): de ahí salen todos los totales de canastillas.
- Los consecutivos deben continuar la numeración real de la finca (Decisión 4): necesito los números actuales o arranco en 1 (configurable).
- Recepción/aceptación sin rol Postcosecha (Decisión 3): mapeo a roles actuales salvo que prefieras crear un rol nuevo.
- Pruebas de concurrencia completas dependen de un entorno con Postgres de test.
