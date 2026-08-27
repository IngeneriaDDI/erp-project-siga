# Diseño — Identidad operativa, permisos granulares y atribución

**Fecha:** 10-jul-2026 · **Alcance:** evolución retrocompatible del RBAC + identidad operativa (no reestructuración).

## 1. Análisis actual
- Auth: JWT; `AuthUser = { userId, email, role, tenantId }`; la estrategia revalida el usuario en BD por request.
- Autorización: por rol con `@Roles` + `RolesGuard`. Roles: SUPER_ADMIN, ADMIN_TENANT, OPERADOR_COSECHA, LECTOR.
- Atribución: remisiones/órdenes/registros guardan `*_by = user_id`; el frontend muestra `user.nombre`.
- Trabajadores: tabla `workers` (persona física, por finca, con soft-status).
- Config por cuenta: columnas en `tenants` + `tenant_module_field_config`. Super Admin administra empresas/usuarios/config.

## 2. Cambios arquitectónicos

### A. Permisos granulares (evolución del RBAC, no un sistema paralelo)
- Catálogo de permisos (strings) + **plantillas por rol** (los roles siguen siendo agrupadores).
- **Override por usuario** (`user_permissions`): si el usuario tiene filas explícitas, ese es su set efectivo; si no, usa la plantilla del rol (retrocompatible). SUPER_ADMIN = todos.
- `PermissionsGuard` + `@RequirePermissions()` conviven con `RolesGuard`/`@Roles`. Endpoints críticos (cosecha/remisiones/órdenes/asignaciones) pasan a permisos; el resto sigue por rol.
- `/auth/me` expone permisos efectivos → **navegación por permisos** en el frontend.

### B. Identidad operativa (concepto genérico)
- `tenants.identity_strategy`: NAMED_USERS | SHARED_OPERATIONAL_USERS | HYBRID (default **NAMED_USERS**).
- `OperationalContext` (enum extensible): HARVEST_WEIGHING, POSTHARVEST_AUTHORIZATION.
- `users.operational_context` (nullable): asocia una **cuenta compartida** a un contexto.
- `operational_position_configs` (tenant, context): `enabled`, `requires_assigned_worker`.
- `operational_assignments` (tenant, context, worker, active, valid_from, valid_to, assigned_by): quién ocupa la posición ahora; **cardinalidad 1** activo; **reasignación transaccional**; la tabla es su propio histórico/auditoría (soft, no borra).

### C. Resolución de identidad efectiva (una sola regla, en backend)
`resolveEffectiveActor(user)`:
- Con `operational_context` + empresa con cuentas compartidas → **worker activo** de (tenant, contexto). Si `requires_assigned_worker` y no hay → error controlado (no guarda).
- Si no → usuario nominativo.
- Devuelve `{ userId, workerId, displayName, source }`. El worker se resuelve en backend (anti-spoofing).

### D. Atribución con snapshot (protege histórico)
Columnas **nullable** en `harvest_remissions`, `production_orders`, `harvest_records`: `*_by_worker_id`, `*_by_actor_name`. Se guarda el nombre efectivo **del momento**; la vista usa el snapshot → reasignaciones/bajas no alteran documentos pasados (Escenario D). DTO: `createdBy: { userId, workerId, displayName, source }`.

## 3. Migraciones (no destructivas)
enums `IdentityStrategy`/`OperationalContext`; `tenants.identity_strategy`; `users.operational_context`; `user_permissions`; `operational_position_configs`; `operational_assignments`; columnas worker/actor en remisiones/órdenes/registros. Todas nullable/con default → sin migrar históricos.

## 4. Seguridad por operación
usuario → tenant → **permiso** → pertenencia del recurso al tenant → **worker asignado** (si la cuenta lo requiere) → contexto. `workerId` resuelto en backend.

## 5. Escenarios A–E
Cubiertos por estrategia + contexto + asignación + resolución con snapshot.

## 6. Retrocompatibilidad
Default NAMED_USERS, columnas nullable, usuarios sin filas de permisos → plantilla del rol. Empresas actuales funcionan igual.
