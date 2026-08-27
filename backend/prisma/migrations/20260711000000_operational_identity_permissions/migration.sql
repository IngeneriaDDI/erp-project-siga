-- ==========================================================================
-- Permisos granulares + Identidad operativa + Atribución con snapshot
-- Todo aditivo/nullable → sin migrar datos históricos ni cambiar su significado.
-- ==========================================================================

-- Enums
CREATE TYPE "IdentityStrategy" AS ENUM ('NAMED_USERS', 'SHARED_OPERATIONAL_USERS', 'HYBRID');
CREATE TYPE "OperationalContext" AS ENUM ('HARVEST_WEIGHING', 'POSTHARVEST_AUTHORIZATION');

-- Estrategia de identidad por empresa (default = comportamiento actual)
ALTER TABLE "tenants" ADD COLUMN "identity_strategy" "IdentityStrategy" NOT NULL DEFAULT 'NAMED_USERS';

-- Contexto operativo del usuario (nullable → usuarios nominativos)
ALTER TABLE "users" ADD COLUMN "operational_context" "OperationalContext";

-- Override de permisos por usuario
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_permissions_user_id_permission_key" ON "user_permissions"("user_id", "permission");
CREATE INDEX "user_permissions_user_id_idx" ON "user_permissions"("user_id");
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Config de posiciones operativas por empresa
CREATE TABLE "operational_position_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "context" "OperationalContext" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "requires_assigned_worker" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "operational_position_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "operational_position_configs_tenant_context_key" ON "operational_position_configs"("tenant_id", "context");
CREATE INDEX "operational_position_configs_tenant_id_idx" ON "operational_position_configs"("tenant_id");
ALTER TABLE "operational_position_configs" ADD CONSTRAINT "opc_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Asignaciones operativas (histórico incluido: soft, no borra)
CREATE TABLE "operational_assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "context" "OperationalContext" NOT NULL,
    "worker_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "assigned_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "operational_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "operational_assignments_tenant_context_idx" ON "operational_assignments"("tenant_id", "context");
CREATE INDEX "operational_assignments_tenant_context_active_idx" ON "operational_assignments"("tenant_id", "context", "active");
CREATE INDEX "operational_assignments_worker_id_idx" ON "operational_assignments"("worker_id");
-- Cardinalidad 1: como máximo un ACTIVO por (tenant, contexto)
CREATE UNIQUE INDEX "operational_assignments_active_unique" ON "operational_assignments"("tenant_id", "context") WHERE "active" = true;
ALTER TABLE "operational_assignments" ADD CONSTRAINT "oa_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_assignments" ADD CONSTRAINT "oa_worker_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_assignments" ADD CONSTRAINT "oa_assigned_by_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Atribución con snapshot: remisiones
ALTER TABLE "harvest_remissions"
  ADD COLUMN "created_by_worker_id" TEXT,
  ADD COLUMN "created_by_actor_name" TEXT,
  ADD COLUMN "received_by_worker_id" TEXT,
  ADD COLUMN "received_by_actor_name" TEXT;
ALTER TABLE "harvest_remissions" ADD CONSTRAINT "hr_created_worker_fkey" FOREIGN KEY ("created_by_worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "harvest_remissions" ADD CONSTRAINT "hr_received_worker_fkey" FOREIGN KEY ("received_by_worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Atribución con snapshot: órdenes
ALTER TABLE "production_orders"
  ADD COLUMN "created_by_worker_id" TEXT,
  ADD COLUMN "created_by_actor_name" TEXT,
  ADD COLUMN "accepted_by_worker_id" TEXT,
  ADD COLUMN "accepted_by_actor_name" TEXT;
ALTER TABLE "production_orders" ADD CONSTRAINT "po_created_worker_fkey" FOREIGN KEY ("created_by_worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "production_orders" ADD CONSTRAINT "po_accepted_worker_fkey" FOREIGN KEY ("accepted_by_worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Atribución con snapshot: registros de cosecha
ALTER TABLE "harvest_records"
  ADD COLUMN "created_by_worker_id" TEXT,
  ADD COLUMN "created_by_actor_name" TEXT;
ALTER TABLE "harvest_records" ADD CONSTRAINT "hrec_created_worker_fkey" FOREIGN KEY ("created_by_worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
