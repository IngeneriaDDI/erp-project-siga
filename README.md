# SIGA-DDI — MVP Módulo de Cosecha

Aplicación web SaaS **multitenant** para fincas agrícolas (arranque: fincas arandaneras).
Reemplaza la solución previa en SharePoint + Power Apps con una arquitectura moderna:
**React + NestJS + PostgreSQL (Prisma)**. El primer módulo funcional es **Cosecha**, sobre
una base de autenticación, multitenancy, tablas maestras y validaciones, lista para crecer.

> El diseño técnico aprobado está en [`DISENO_TECNICO_MVP_Cosecha.md`](./DISENO_TECNICO_MVP_Cosecha.md).

---

## 1. Stack

| Capa | Tecnología |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind + React Router + React Hook Form + Zod + Axios |
| Backend | NestJS + TypeScript |
| ORM | Prisma |
| Base de datos | PostgreSQL 16 (base compartida, columna `tenant_id`) |
| Auth | JWT (access en memoria) + refresh token en cookie httpOnly + bcrypt |
| Infra local | Docker Compose (backend, frontend, postgres, pgAdmin opcional) |

---

## 2. Requisitos

- **Con Docker (recomendado):** Docker Desktop / Docker Engine + Docker Compose.
- **Sin Docker (manual):** Node.js 20+, npm y una instancia de PostgreSQL 16.

---

## 3. Estructura del proyecto

```txt
Proyecto total ERP/
├── backend/                # API NestJS
│   ├── src/
│   │   ├── auth/           # login, refresh, JWT, estrategia
│   │   ├── common/         # guards, decoradores, filtros, tenant, tipos
│   │   ├── prisma/         # PrismaService/Module
│   │   ├── tenants/ users/ farms/ workers/ lots/ containers/ qualities/
│   │   ├── field-config/   # configuración de campos por tenant
│   │   ├── harvest/        # módulo de cosecha (cálculo + validaciones)
│   │   ├── app.module.ts
│   │   └── main.ts
│   └── prisma/
│       ├── schema.prisma
│       ├── migrations/     # migración inicial SQL
│       └── seed.ts
├── frontend/               # SPA React (Vite)
│   └── src/
│       ├── components/     # ui/, Layout, ProtectedRoute, RoleGuard, CrudPage, harvest/
│       ├── context/        # AuthContext
│       ├── hooks/ lib/ services/ schemas/ types/
│       └── pages/          # login, dashboard, maestros, cosecha
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 4. Puesta en marcha con Docker Compose (recomendado)

```bash
# 1. Copia las variables de entorno
cp .env.example .env

# 2. Levanta todo (postgres + backend + frontend)
docker compose up --build

# (opcional) incluir pgAdmin
docker compose --profile tools up --build
```

Al arrancar, el backend aplica migraciones y ejecuta el **seed** automáticamente
(`prisma migrate deploy && prisma db seed`). Cuando termine:

- **Frontend:** http://localhost:8080
- **API:** http://localhost:3000
- **pgAdmin (opcional):** http://localhost:5050

Para detener: `docker compose down` (agrega `-v` para borrar también la base de datos).

---

## 5. Puesta en marcha manual (sin Docker)

**Base de datos:** ten una instancia de PostgreSQL corriendo y ajusta `DATABASE_URL`
en `backend/.env` (host `localhost`).

**Backend**

```bash
cd backend
cp ../.env.example .env          # ajusta DATABASE_URL a tu Postgres local
npm install
npm run prisma:generate
npm run prisma:deploy            # aplica migraciones
npm run prisma:seed              # datos demo
npm run start:dev                # API en http://localhost:3000
```

**Frontend**

```bash
cd frontend
cp .env.example .env             # VITE_API_URL=http://localhost:3000
npm install
npm run dev                      # http://localhost:5173
```

---

## 6. Usuarios de prueba (seed)

| Rol | Email | Contraseña |
|---|---|---|
| SUPER_ADMIN | `admin@erp-agricola.com` | `Admin123*` |
| ADMIN_TENANT | `admin.demo@erp-agricola.com` | `Admin123*` |
| OPERADOR_COSECHA | `operador.demo@erp-agricola.com` | `Operador123*` |
| LECTOR | `lector.demo@erp-agricola.com` | `Lector123*` |

También crea un tenant demo (**Finca Arandanera Demo**), una finca (**Finca Principal**),
cosechadores, lotes, recipientes (Canastilla pequeña 500 g, Canastilla grande 800 g, Balde 1000 g),
calidades (Primera, Segunda, Roja, Descarte) y un registro de cosecha de ejemplo.

> **SUPER_ADMIN:** para administrar datos de un tenant, selecciónalo en el menú superior
> (esto envía el header `X-Tenant-Id`). Los usuarios normales operan siempre sobre su propio tenant.

---

## 7. Arquitectura

### Backend (por capas)

```txt
Request → [JwtAuthGuard] → [RolesGuard] → Controller → Service → Prisma → PostgreSQL
```

- **JwtAuthGuard** (global): valida el access token salvo en rutas `@Public()` (login/refresh).
- **RolesGuard** (global): valida el rol requerido por `@Roles(...)`.
- **@TenantId()**: resuelve el tenant efectivo (del token para usuarios normales; del header
  `X-Tenant-Id` para SUPER_ADMIN). El frontend **nunca** decide el tenant de un usuario normal.
- **Services**: contienen la lógica y **siempre filtran por `tenant_id`**. El backend recalcula
  la cosecha y valida la configuración de campos: es la única fuente de verdad.
- **HttpExceptionFilter**: formato de error uniforme (incluye errores de Prisma).

### Frontend

- `AuthContext` mantiene la sesión (access token en memoria + refresh vía cookie httpOnly).
- `api.ts` (Axios) adjunta el token y, ante un 401, intenta `/auth/refresh` y reintenta.
- `ProtectedRoute` protege rutas privadas; `RoleGuard` oculta pantallas por rol (UX).
- `CrudPage` es un componente genérico reutilizado por las pantallas maestras.

---

## 8. Cómo funciona el multitenant

Estrategia: **base de datos compartida + columna `tenant_id`** en cada tabla operativa/maestra.

1. El `tenant_id` de un usuario normal se toma **del token JWT**, nunca del body/cliente.
2. Un **SUPER_ADMIN** (sin tenant) opera sobre un tenant enviando el header `X-Tenant-Id`.
3. Cada consulta/escritura filtra por `tenant_id` en la capa de servicio.
4. La BD refuerza el aislamiento con unicidad por tenant (`unique(tenant_id, …)`) y validación
   de pertenencia cruzada (cosechador, lote, calidad y recipiente deben ser del mismo tenant).

Resultado: **un usuario de un tenant no puede ver ni tocar datos de otro tenant.**

---

## 9. Roles y permisos

| Recurso | SUPER_ADMIN | ADMIN_TENANT | OPERADOR_COSECHA | LECTOR |
|---|:---:|:---:|:---:|:---:|
| Tenants | ✅ | ❌ | ❌ | ❌ |
| Usuarios (de un tenant) | ✅ | ✅ | ❌ | ❌ |
| Fincas / Cosechadores / Lotes / Recipientes / Calidades | ✅ | ✅ | 👁️ | 👁️ |
| Config. de campos (cosecha) | ✅ | ✅ | ❌ | ❌ |
| Cosecha — crear/editar/anular | ✅ | ✅ | ✅ | ❌ |
| Cosecha — consultar | ✅ | ✅ | ✅ | ✅ |

✅ gestión total · 👁️ solo lectura · ❌ sin acceso

Los permisos se aplican en **frontend** (ocultar menús/botones) y, sobre todo, en el **backend**
(`RolesGuard` + filtrado por tenant), que es la autoridad real.

---

## 10. Módulo de cosecha y cálculo

Cada registro de cosecha puede tener **uno o varios recipientes**. El backend copia el peso del
recipiente como **snapshot** (histórico) y calcula de forma oficial:

```txt
peso_total_recipientes = Σ (unidades × peso_unitario_gramos)
gramos_cosechados      = peso_bruto_gramos − peso_total_recipientes
```

**Ejemplo**

```txt
Peso bruto: 12.000 g
  Canastilla pequeña → 2 × 500 g = 1.000 g
  Canastilla grande  → 1 × 800 g =   800 g
Peso recipientes = 1.800 g
Gramos cosechados = 12.000 − 1.800 = 10.200 g
```

El frontend muestra el cálculo en vivo; el backend lo **recalcula y persiste** (no confía en el valor del cliente).
La **variedad** se toma del lote (fuente única) y se guarda como snapshot en el registro.

---

## 11. Ejemplos de payloads (API)

> Reemplaza los `<ID>` por los reales. Guarda el `accessToken` del login y envíalo como
> `Authorization: Bearer <token>`. El refresh token viaja en una cookie httpOnly (usa `-c/-b cookies.txt` en curl).

**Login**

```bash
curl -i -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"admin.demo@erp-agricola.com","password":"Admin123*"}'
# → { "accessToken": "...", "user": { ... } }
```

**Usuario autenticado**

```bash
curl http://localhost:3000/auth/me -H "Authorization: Bearer <TOKEN>"
```

**Crear tenant (SUPER_ADMIN)**

```bash
curl -X POST http://localhost:3000/tenants \
  -H "Authorization: Bearer <TOKEN_SUPER_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Finca Los Andes","nit":"901234567-8"}'
```

**Crear finca (ADMIN_TENANT; SUPER_ADMIN debe añadir `-H "X-Tenant-Id: <TENANT_ID>"`)**

```bash
curl -X POST http://localhost:3000/farms \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Finca Norte","ubicacion":"Boyacá"}'
```

**Crear cosechador / lote / recipiente / calidad**

```bash
curl -X POST http://localhost:3000/workers -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","codigoInterno":"W010","nombre":"Ana López","areaTrabajo":"Bloque C"}'

curl -X POST http://localhost:3000/lots -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","nombreLote":"Lote 4","variedad":"Biloxi","numeroPlantas":800}'

curl -X POST http://localhost:3000/containers -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"nombre":"Canastilla mediana","pesoGramos":650}'

curl -X POST http://localhost:3000/qualities -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"nombre":"Exportación","visibleEnCosecha":true}'
```

**Configurar campos del módulo de cosecha**

```bash
curl -X PATCH http://localhost:3000/module-field-config/harvest \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"items":[
        {"fieldName":"primera_fila","isVisible":true,"isRequired":true},
        {"fieldName":"estado_roja","isVisible":true,"isRequired":false}
      ]}'
```

**Registrar cosecha (uno o varios recipientes)**

```bash
curl -X POST http://localhost:3000/harvest-records \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{
    "farmId": "<FARM_ID>",
    "fecha": "2026-07-06",
    "workerId": "<WORKER_ID>",
    "qualityId": "<QUALITY_ID>",
    "lotId": "<LOT_ID>",
    "pesoBrutoGramos": 12000,
    "containers": [
      { "containerId": "<CONTAINER_PEQUENA_ID>", "unidades": 2 },
      { "containerId": "<CONTAINER_GRANDE_ID>",  "unidades": 1 }
    ],
    "primeraFila": "1",
    "ultimaFila": "20",
    "observaciones": "Recolección de la mañana"
  }'
# → registro con gramosCosechados = 10200 (calculado por el backend)
```

**Listar / filtrar cosecha**

```bash
curl "http://localhost:3000/harvest-records?fechaDesde=2026-07-01&fechaHasta=2026-07-31&page=1&pageSize=20" \
  -H "Authorization: Bearer <TOKEN>"
```

**Anular cosecha**

```bash
curl -X PATCH http://localhost:3000/harvest-records/<ID>/cancel -H "Authorization: Bearer <TOKEN>"
```

---

## 12. Resumen de endpoints

```txt
Auth        POST /auth/login · POST /auth/refresh · POST /auth/logout · GET /auth/me
Tenants     GET/POST /tenants · GET/PATCH /tenants/:id · PATCH /tenants/:id/status         (SUPER_ADMIN)
Users       GET/POST /users · GET/PATCH /users/:id · PATCH /users/:id/status               (SUPER_ADMIN, ADMIN_TENANT)
Farms       GET/POST /farms · GET/PATCH /farms/:id · PATCH /farms/:id/status
Workers     GET/POST /workers · GET/PATCH /workers/:id · PATCH /workers/:id/status
Lots        GET/POST /lots · GET/PATCH /lots/:id · PATCH /lots/:id/status
Containers  GET/POST /containers · GET/PATCH /containers/:id · PATCH /containers/:id/status
Qualities   GET/POST /qualities · GET/PATCH /qualities/:id · PATCH /qualities/:id/status
FieldConfig GET/PATCH /module-field-config/harvest
Harvest     GET/POST /harvest-records · GET/PATCH /harvest-records/:id · PATCH /harvest-records/:id/cancel
```

Lectura de maestros y cosecha: cualquier usuario autenticado (dentro de su tenant).
Escritura de maestros: SUPER_ADMIN / ADMIN_TENANT. Escritura de cosecha: + OPERADOR_COSECHA.

---

## 13. Cómo agregar un nuevo módulo en el futuro

El proyecto está pensado para crecer (postcosecha, inventario, calidad, costos, combustible, etc.).
Para un módulo nuevo, por ejemplo **postcosecha**:

1. **Modelo (Prisma):** agrega las tablas en `backend/prisma/schema.prisma`, siempre con
   `tenantId` y sus índices. Crea la migración (`npm run prisma:migrate -- --name postharvest`).
2. **Backend:** crea `backend/src/postharvest/` con `*.module.ts`, `*.controller.ts`,
   `*.service.ts` y DTOs. Reutiliza `@TenantId()`, `requireTenant()`, `@Roles()` y
   `PrismaService`. Registra el módulo en `app.module.ts`.
3. **Campos configurables (opcional):** reutiliza `tenant_module_field_config` con
   `module_name = 'postharvest'` (la misma mecánica que en cosecha).
4. **Frontend:** agrega `services/postharvest.ts`, tipos en `types/`, páginas en `pages/`,
   rutas en `App.tsx` y el ítem de menú en `Layout.tsx` con sus roles.

El aislamiento por tenant y la seguridad se heredan automáticamente al seguir estos patrones.

---

## 14. Notas de seguridad

- Rutas privadas exigen JWT; el rol y el tenant se validan en el backend.
- El `tenant_id` de usuarios normales proviene del token, nunca del cliente.
- Contraseñas con bcrypt; el hash nunca se expone en las respuestas.
- El cálculo de cosecha y la obligatoriedad de campos se validan en el backend (autoridad real).
- **Producción:** cambia los secretos JWT (`openssl rand -hex 32`), sirve por HTTPS y pon
  `COOKIE_SECURE=true`.
