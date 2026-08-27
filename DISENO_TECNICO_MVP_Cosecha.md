# Diseño Técnico — MVP SIGA-DDI / Módulo de Cosecha

**Proyecto:** ERP para fincas agrícolas (arranque: fincas arandaneras)
**Alcance de este documento:** diseño técnico para aprobación. **No incluye código.**
**Fecha:** 6 de julio de 2026
**Estado:** Borrador para revisión y aprobación

---

## 0. Resumen ejecutivo y stack recomendado

Aplicación web **SaaS multitenant** que reemplaza la solución actual de SharePoint + Power Apps. El primer módulo funcional es **Cosecha**, sobre una base de autenticación, multitenancy, tablas maestras y validaciones, dejando la arquitectura lista para módulos futuros (postcosecha, inventario, calidad, costos, etc.).

| Capa | Tecnología recomendada | Notas |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind + React Router + React Hook Form + Zod + Axios | SPA responsive (PC / tablet / celular) |
| Backend | **NestJS** + TypeScript ✅ confirmado | Guards/módulos nativos encajan con RBAC + tenant |
| ORM | Prisma | Migraciones + seed |
| Base de datos | PostgreSQL 16 | Base compartida, columna `tenant_id` |
| Auth | JWT + bcrypt ✅ | Access token en memoria + refresh token en cookie httpOnly |
| Infra local | Docker Compose | backend + frontend + postgres + pgAdmin |

> **Decisiones confirmadas (6-jul-2026):** Backend **NestJS** · Auth **cookie httpOnly + refresh** · Variedad **como atributo del lote + snapshot en cosecha** · Usuario ve **todas las fincas de su tenant**. Detalle y justificación en §10.

Las decisiones que requieren tu aprobación explícita están consolidadas en **§10**.

---

## 1. Arquitectura propuesta

### 1.1 Organización del repositorio (monorepo)

```txt
erp-agricola/
├── frontend/          # React + Vite (SPA)
├── backend/           # NestJS (API REST)
│   └── prisma/        # schema.prisma, migraciones, seed.ts
├── docker-compose.yml
├── .env.example
└── README.md
```

Monorepo simple (dos apps + orquestación). Evita la sobrecarga de herramientas de monorepo (Nx/Turbo) que no aportan en un MVP.

### 1.2 Arquitectura del backend (por capas)

```txt
HTTP Request
   │
   ▼
[Middleware / Guards globales]
   1. JwtAuthGuard      → valida token, carga usuario
   2. TenantContext     → fija tenant_id efectivo (del token; SUPER_ADMIN lo pasa explícito)
   3. RolesGuard        → valida rol requerido por el endpoint
   │
   ▼
[Controller]  → define ruta, DTO de entrada
   │
   ▼
[Service]     → lógica de negocio, SIEMPRE filtra por tenant_id, recalcula cosecha
   │
   ▼
[Prisma]      → acceso a datos (+ extensión que auto-inyecta tenant_id como defensa en profundidad)
   │
   ▼
PostgreSQL
```

Principios: controladores delgados, lógica en servicios, validación de entrada declarativa (DTOs), y el **backend como única fuente de verdad** de permisos, tenant y cálculos.

### 1.3 Arquitectura del frontend

- SPA con React Router. Rutas públicas (`/login`) y privadas envueltas en `ProtectedRoute` + `RoleGuard`.
- `AuthContext` guarda el usuario autenticado, rol y tenant; se hidrata desde `GET /auth/me`.
- Capa `services/` con un cliente Axios central (interceptor que adjunta el access token; ante 401 intenta `/auth/refresh` y, si falla, hace logout).
- `schemas/` con Zod: valida formularios en cliente **reflejando** las reglas del backend (nunca las reemplaza).
- Formularios con React Hook Form + `zodResolver`.

### 1.4 Cross-cutting

Manejo centralizado de errores (formato de error uniforme), logging de request, configuración por variables de entorno, y una capa de validación de entrada (DTOs con `class-validator` en NestJS, o Zod si se opta por Express).

---

## 2. Modelo de base de datos

### 2.1 Principios de diseño

1. **Todo dato de negocio pertenece a un tenant** → columna `tenant_id` en toda tabla operativa/maestra (excepto `tenants` y el usuario SUPER_ADMIN global).
2. **Nada se borra físicamente** si tiene historial → borrado lógico vía `status` (`ACTIVE` / `INACTIVE`), y `CANCELLED` para registros de cosecha anulados.
3. **Normalización**: cosechadores, lotes, recipientes, calidades y variedades son tablas maestras; el registro de cosecha referencia por FK, no por texto.
4. **Snapshots históricos**: valores que provienen de un maestro (peso del recipiente, variedad del lote) se **copian** al registro de cosecha al guardar, para no alterar registros pasados y para leerlos sin JOIN al visualizar.
5. **Pesos en gramos como enteros** (`Int`) para evitar errores de coma flotante. *(A confirmar: `Decimal(12,2)` si se requieren fracciones de gramo — ver §10.)*
6. **Auditoría**: `created_at` / `updated_at` en todas las tablas; `created_by` / `updated_by` en `harvest_records`.

### 2.2 Enumeraciones

- `Role`: `SUPER_ADMIN` · `ADMIN_TENANT` · `OPERADOR_COSECHA` · `LECTOR`
- `Status`: `ACTIVE` · `INACTIVE`
- `HarvestStatus`: `ACTIVE` · `CANCELLED`

### 2.3 Tablas

**tenants** (cliente / cuenta / empresa agrícola)

| Campo | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| nombre | text | requerido |
| nit | text? | opcional, único si se informa |
| status | Status | default ACTIVE |
| created_at / updated_at | timestamptz | |

**farms** (finca)

| Campo | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK→tenants | requerido |
| nombre | text | requerido, único por tenant |
| ubicacion | text? | opcional |
| status | Status | default ACTIVE |
| created_at / updated_at | timestamptz | |

**users** (usuarios del sistema)

| Campo | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid? FK→tenants | **null solo para SUPER_ADMIN** |
| nombre | text | requerido |
| email | text | requerido, **único global** |
| password_hash | text | bcrypt |
| role | Role | requerido |
| status | Status | default ACTIVE |
| created_at / updated_at | timestamptz | |

**workers** (cosechadores)

| Campo | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | requerido |
| farm_id | uuid FK→farms | requerido |
| codigo_interno | text | **único por (tenant_id, farm_id)** *(a confirmar §10)* |
| nombre | text | requerido |
| documento | text? | opcional |
| area_trabajo | text? | opcional |
| status | Status | no eliminar si tiene cosechas |
| created_at / updated_at | timestamptz | |

**lots** (lotes productivos)

| Campo | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | requerido |
| farm_id | uuid FK→farms | requerido |
| nombre_lote | text | único por finca |
| variedad | text | **fuente de la variedad** (vive en el lote; no cambia) |
| numero_plantas | int? | opcional, ≥ 0 |
| status | Status | |
| created_at / updated_at | timestamptz | |

**containers** (recipientes)

| Campo | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | requerido |
| nombre | text | requerido, único por tenant |
| peso_gramos | int | **≥ 0** (peso de tara) |
| status | Status | no eliminar si fue usado |
| created_at / updated_at | timestamptz | |

**qualities** (calidades)

| Campo | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | requerido |
| nombre | text | requerido, único por tenant |
| descripcion | text? | opcional |
| visible_en_cosecha | bool | default true |
| status | Status | |
| created_at / updated_at | timestamptz | |

**harvest_records** (registro de cosecha — cabecera)

| Campo | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | requerido |
| farm_id | uuid FK→farms | requerido |
| fecha | date | **requerido** |
| worker_id | uuid FK→workers | mismo tenant, activo |
| quality_id | uuid FK→qualities | mismo tenant, activa y visible |
| lot_id | uuid FK→lots | mismo tenant/finca, activo |
| variedad | text | **snapshot** copiado del lote al guardar (sin JOIN al listar) |
| peso_bruto_gramos | int | **> 0** |
| peso_total_recipientes_gramos | int | calculado por backend |
| gramos_cosechados | int | **≥ 0**, calculado por backend |
| primera_fila | text? | configurable por tenant |
| ultima_fila | text? | configurable por tenant |
| estado_roja | text? | configurable por tenant |
| observaciones | text? | configurable por tenant |
| status | HarvestStatus | default ACTIVE |
| created_by / updated_by | uuid FK→users | auditoría |
| created_at / updated_at | timestamptz | |

**harvest_record_containers** (recipientes por registro — detalle)

| Campo | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| harvest_record_id | uuid FK→harvest_records | on delete cascade |
| container_id | uuid FK→containers | mismo tenant, activo |
| unidades | int | **> 0** |
| peso_unitario_gramos | int | **snapshot** copiado del container |
| peso_total_gramos | int | = unidades × peso_unitario_gramos |
| created_at | timestamptz | |

**tenant_module_field_config** (configuración de campos por tenant)

| Campo | Tipo | Reglas |
|---|---|---|
| id | uuid PK | |
| tenant_id | uuid FK | requerido |
| module_name | text | p. ej. `harvest` |
| field_name | text | p. ej. `primera_fila` |
| is_required | bool | default false |
| is_visible | bool | default true |
| created_at / updated_at | timestamptz | |
| | | **único por (tenant_id, module_name, field_name)** |

---

## 3. Tablas principales y relaciones

```txt
tenants ──1:N── farms
tenants ──1:N── users            (SUPER_ADMIN: tenant_id = null)
tenants ──1:N── workers ──N:1── farms
tenants ──1:N── lots    ──N:1── farms      (lots.variedad = fuente de variedad)
tenants ──1:N── containers
tenants ──1:N── qualities
tenants ──1:N── tenant_module_field_config

harvest_records ──N:1── tenant, farm, worker, quality, lot
harvest_records ──1:N── harvest_record_containers ──N:1── containers
harvest_records ──N:1── users (created_by / updated_by)
   (harvest_records.variedad = snapshot copiado del lote)
```

**Cardinalidades clave**

- Un **tenant** tiene muchas fincas, usuarios, cosechadores, lotes, recipientes, calidades, variedades y configuraciones.
- Una **finca** tiene muchos cosechadores, lotes y registros de cosecha.
- Un **registro de cosecha** tiene **uno o varios** recipientes asociados (relación 1:N con `harvest_record_containers`), lo que permite pesar varios tipos de recipiente en un mismo pesaje.
- **Integridad de tenant**: cosechador, lote, calidad, recipiente y finca de un registro deben pertenecer al **mismo tenant**. Se valida en el servicio; opcionalmente se refuerza con claves compuestas `(tenant_id, id)`.

---

## 4. Estrategia multitenant

**Modelo:** base de datos compartida + esquema compartido + columna discriminadora `tenant_id`. Es la estrategia correcta para arrancar: barata, simple de operar y permite vender a varios clientes sin aprovisionar infraestructura por cliente.

**Origen del `tenant_id` (regla de oro):**

- Usuarios normales (ADMIN_TENANT, OPERADOR_COSECHA, LECTOR): el `tenant_id` se toma **del token JWT / contexto del usuario**. **Nunca** se confía en el `tenant_id` enviado por el frontend.
- SUPER_ADMIN (`tenant_id = null`): puede operar sobre cualquier tenant, pero debe indicar el tenant destino de forma **explícita y validada** (encabezado `X-Tenant-Id` o parámetro), nunca implícito.

**Defensa en profundidad (4 capas):**

1. **TenantContext (guard):** fija el `tenant_id` efectivo de la petición.
2. **Capa de servicio:** toda consulta/escritura incluye `where tenant_id = ctx.tenantId`.
3. **Extensión de Prisma:** auto-inyecta el filtro `tenant_id` en las queries de modelos tenant-scoped, como red de seguridad ante un olvido en el servicio.
4. **Restricciones de BD:** unicidad por tenant (`unique(tenant_id, ...)`) y validación de pertenencia cruzada.

**Evolución futura:** como el contexto de tenant está centralizado, migrar a *schema-per-tenant* o *DB-per-tenant* para un cliente grande no requiere reescribir la lógica de negocio.

---

## 5. Roles y permisos

Cuatro roles para el MVP. **RBAC estático** (mapa rol → capacidades en código). Recomiendo dejar una tabla de permisos granular para una fase posterior, no para el MVP (ver §10).

| Recurso | SUPER_ADMIN | ADMIN_TENANT | OPERADOR_COSECHA | LECTOR |
|---|:---:|:---:|:---:|:---:|
| Tenants (crear/editar/estado) | ✅ | ❌ | ❌ | ❌ |
| Ver todos los tenants | ✅ | ❌ | ❌ | ❌ |
| Usuarios de un tenant | ✅ | ✅ (su tenant) | ❌ | ❌ |
| Fincas | ✅ | ✅ (su tenant) | 👁️ | 👁️ |
| Cosechadores / Lotes / Recipientes / Calidades / Variedades | ✅ | ✅ (su tenant) | 👁️ | 👁️ |
| Config. de campos (harvest) | ✅ | ✅ (su tenant) | ❌ | ❌ |
| Registros de cosecha — crear/editar/anular | ✅ | ✅ | ✅ | ❌ |
| Registros de cosecha — consultar | ✅ | ✅ | ✅ | ✅ |

✅ gestión total · 👁️ solo lectura (necesaria para poblar formularios) · ❌ sin acceso

**Aplicación:** permisos protegidos en **frontend** (UX: ocultar menús/botones vía `RoleGuard`) y en **backend** (autoridad real: `RolesGuard` + filtrado por tenant en cada servicio). El frontend nunca es la fuente de verdad.

---

## 6. Flujo del módulo de cosecha

### 6.1 Flujo funcional (registro)

1. **Login** → se establece el contexto (usuario, rol, tenant).
2. El operador abre el **formulario de cosecha**. El frontend carga en paralelo: configuración de campos del tenant (`/module-field-config/harvest`), cosechadores activos, lotes activos, recipientes activos y calidades **activas y visibles** de la finca/tenant.
3. Selecciona **fecha, finca, cosechador, calidad, lote**. Al elegir el lote, **la variedad se autocompleta**.
4. Ingresa el **peso bruto** (gramos).
5. Agrega **una o varias filas de recipientes** (`DynamicContainerRows`): por cada fila elige tipo de recipiente → el **peso unitario se copia** del maestro; ingresa **unidades**; el **peso total** de la fila se calcula (`unidades × peso_unitario`).
6. El frontend muestra en vivo el **peso total de recipientes** y los **gramos cosechados**.
7. **Submit** → el backend: valida pertenencia al tenant, estados activos y campos requeridos por configuración; **recalcula** `peso_total_recipientes` y `gramos_cosechados`; verifica `≥ 0`; guarda cabecera + detalle en **una transacción**.
8. Flujos adicionales: **listar** (con filtros), **ver detalle**, **editar**, **anular** (`status = CANCELLED`, sin borrado físico).

### 6.2 Cálculo (fórmula oficial)

```txt
peso_total_recipientes = Σ (unidades × peso_unitario_gramos)
gramos_cosechados      = peso_bruto_gramos − peso_total_recipientes
```

Restricción: `gramos_cosechados ≥ 0`. El frontend lo muestra para el operador; el **backend lo recalcula y persiste el valor oficial** (nunca confía en el número enviado por el cliente).

### 6.3 Ejemplo

```txt
Peso bruto: 12.000 g
  Recipiente A → 2 unidades × 500 g = 1.000 g
  Recipiente B → 1 unidad  × 800 g =   800 g
Peso total recipientes = 1.800 g
Gramos cosechados = 12.000 − 1.800 = 10.200 g
```

---

## 7. Endpoints (API REST)

Todas las rutas privadas requieren **JWT**. Notación de acceso: 🟣 SUPER_ADMIN · 🔵 ADMIN_TENANT · 🟢 OPERADOR_COSECHA · ⚪ LECTOR.

**Auth**

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/auth/login` | público |
| GET | `/auth/me` | autenticado |
| POST | `/auth/refresh` | cookie de refresh (rota el access token) |
| POST | `/auth/logout` | autenticado (invalida el refresh token) |

**Tenants** — 🟣

| Método | Ruta |
|---|---|
| GET | `/tenants` |
| POST | `/tenants` |
| GET | `/tenants/:id` |
| PATCH | `/tenants/:id` |
| PATCH | `/tenants/:id/status` |

**Users** — 🟣🔵 · **Farms / Workers / Lots / Containers / Qualities** — 🟣🔵 (lectura también 🟢⚪)

Cada recurso expone el mismo patrón CRUD + cambio de estado:

| Método | Ruta (patrón) |
|---|---|
| GET | `/{recurso}` (con filtros y paginación) |
| POST | `/{recurso}` |
| GET | `/{recurso}/:id` |
| PATCH | `/{recurso}/:id` |
| PATCH | `/{recurso}/:id/status` |

Recursos: `users`, `farms`, `workers`, `lots`, `containers`, `qualities`. (La variedad se administra dentro del lote; no tiene CRUD propio.)

**Harvest** — crear/editar/anular 🟣🔵🟢 · consultar +⚪

| Método | Ruta |
|---|---|
| GET | `/harvest-records` (filtros: `fechaDesde`, `fechaHasta`, `farmId`, `workerId`, `lotId`, `qualityId`, `page`, `pageSize`) |
| POST | `/harvest-records` |
| GET | `/harvest-records/:id` |
| PATCH | `/harvest-records/:id` |
| PATCH | `/harvest-records/:id/cancel` |

**Field config** — 🟣🔵

| Método | Ruta |
|---|---|
| GET | `/module-field-config/harvest` |
| PATCH | `/module-field-config/harvest` |

> Los GET de maestros aceptan `?status=ACTIVE` y `?farmId=` para poblar los desplegables del formulario de cosecha (solo entidades válidas).

---

## 8. Pantallas del frontend

**Pública**

- **Login**.

**Privadas** (dentro de `Layout` con menú lateral; visibilidad por rol)

| Pantalla | Rol |
|---|---|
| Dashboard (usuario, tenant, finca, accesos) | todos |
| Administración de tenants | 🟣 |
| Administración de usuarios | 🟣🔵 |
| Administración de fincas | 🔵 |
| Administración de cosechadores | 🔵 |
| Administración de lotes | 🔵 |
| Administración de recipientes | 🔵 |
| Administración de calidades | 🔵 |
| Configuración del módulo de cosecha | 🔵 |
| Listado de registros de cosecha (con filtros) | todos |
| Crear / editar registro de cosecha | 🟣🔵🟢 |
| Detalle de registro de cosecha | todos |

**Componentes reutilizables:** `Input`, `Select`, `Button`, `Table`, `Modal`, `FormSection`, `ProtectedRoute`, `RoleGuard`, `DynamicContainerRows` (filas dinámicas de recipientes con cálculo en vivo).

**Responsive:** diseñado mobile-first para registro en campo (tablet/celular).

---

## 9. Validaciones principales

Validación **en dos capas**: Zod en frontend (UX inmediata) y backend como **autoridad**. Nunca solo en cliente.

**Generales**

- Campos obligatorios presentes; sin texto en campos numéricos; sin números negativos en pesos/unidades/gramos; fechas válidas.
- Prohibido relacionar entidades de **otro tenant**.
- Prohibido seleccionar cosechadores, lotes, recipientes o calidades **inactivos**; calidades **no visibles** en cosecha.

**Específicas de cosecha**

- `peso_bruto_gramos > 0`.
- **Al menos un** recipiente asociado.
- `unidades > 0` por fila; `peso_unitario_gramos` copiado del maestro (snapshot).
- `Σ peso_total_recipientes ≤ peso_bruto_gramos` (no puede superar el bruto).
- `gramos_cosechados ≥ 0` (recalculado por backend).
- Si `primera_fila` y `ultima_fila` están visibles y diligenciadas → coherencia entre ambas.

**Dirigidas por configuración del tenant** (`tenant_module_field_config`)

- Si `is_visible = false` → el campo no aparece en el formulario.
- Si `is_required = true` → el **backend** exige el campo antes de guardar (aplica a `primera_fila`, `ultima_fila`, `estado_roja`, `observaciones`).

---

## 10. Riesgos técnicos y decisiones a confirmar

**Decisiones confirmadas (6-jul-2026):**

1. ✅ **Backend: NestJS.** Módulos, guards, interceptores e inyección de dependencias para RBAC, contexto de tenant y crecimiento por módulos.
2. ✅ **Auth: access token corto en memoria + refresh token en cookie httpOnly.** Más seguro frente a XSS para uso en campo; se añade `POST /auth/refresh`.
3. ✅ **Variedad: atributo del lote (`lots.variedad`), fuente única; snapshot en `harvest_records.variedad` copiado al guardar.** No se crea tabla maestra ni CRUD propio. Sobre tu duda de recursos: al guardar la variedad como snapshot en el registro, **listar cosechas no requiere ningún JOIN** (se lee directo de la fila), así que no hay costo extra al visualizar; el lote sigue siendo la fuente que la precarga en el formulario.
4. ✅ **Alcance: el usuario ve todas las fincas de su tenant** y filtra por finca en pantalla. No se requiere tabla `user_farms` en el MVP.

**Decisiones que tomo por defecto (dime si prefieres otra):**

5. **Unicidad de `codigo_interno`** del cosechador: único por **(tenant, finca)**. Alternativa: por tenant.
6. **Pesos como enteros en gramos** (`Int`). Alternativa: `Decimal(12,2)` si necesitas fracciones.
7. **Permisos: RBAC estático** por rol en el MVP; tabla de permisos granular queda para fase 2.

**Riesgos técnicos y mitigaciones:**

- **Fuga de datos entre tenants** → mitigado con las 4 capas de §4 (guard, servicio, extensión Prisma, restricciones BD). Es el riesgo #1 de un multitenant compartido.
- **Errores de coma flotante en pesos** → mitigado usando enteros en gramos.
- **Deriva entre validación de frontend y backend** → una sola fuente conceptual de reglas; el backend siempre revalida.
- **Integridad histórica** → snapshot de `peso_unitario_gramos` para no alterar registros pasados si cambia el maestro.
- **Uso en campo sin conexión (offline)** → **fuera de alcance del MVP**; si es necesario, es un proyecto aparte (PWA + sincronización). Conviene decidirlo pronto por su impacto.
- **Escalabilidad de la base compartida** → índices por `tenant_id` y compuestos `(tenant_id, fecha)`, `(tenant_id, farm_id)` para los filtros de cosecha.

---

## Próximo paso

Con tus respuestas a las decisiones **1–4** (y confirmación de 5–7) queda cerrado el diseño y procedo, en el orden de la spec: estructura del proyecto → modelo Prisma → migraciones/seed → backend por módulos → auth/permisos → CRUD maestros → módulo de cosecha → validaciones → frontend → Docker Compose → README → revisión final de seguridad.
