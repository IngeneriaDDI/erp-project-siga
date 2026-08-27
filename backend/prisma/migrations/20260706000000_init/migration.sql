-- ==========================================================================
-- Migración inicial — ERP Agrícola (MVP Cosecha)
-- ==========================================================================

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN_TENANT', 'OPERADOR_COSECHA', 'LECTOR');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "HarvestStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nit" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farms" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ubicacion" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "codigo_interno" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "area_trabajo" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "nombre_lote" TEXT NOT NULL,
    "variedad" TEXT NOT NULL,
    "numero_plantas" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "containers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "peso_gramos" INTEGER NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "visible_en_cosecha" BOOLEAN NOT NULL DEFAULT true,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "qualities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_records" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "worker_id" TEXT NOT NULL,
    "quality_id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "variedad" TEXT NOT NULL,
    "peso_bruto_gramos" INTEGER NOT NULL,
    "peso_total_recipientes_gramos" INTEGER NOT NULL,
    "gramos_cosechados" INTEGER NOT NULL,
    "primera_fila" TEXT,
    "ultima_fila" TEXT,
    "estado_roja" TEXT,
    "observaciones" TEXT,
    "status" "HarvestStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "harvest_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_record_containers" (
    "id" TEXT NOT NULL,
    "harvest_record_id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "unidades" INTEGER NOT NULL,
    "peso_unitario_gramos" INTEGER NOT NULL,
    "peso_total_gramos" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "harvest_record_containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_module_field_config" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "module_name" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenant_module_field_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "farms_tenant_id_idx" ON "farms"("tenant_id");
CREATE UNIQUE INDEX "farms_tenant_id_nombre_key" ON "farms"("tenant_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "workers_tenant_id_idx" ON "workers"("tenant_id");
CREATE INDEX "workers_farm_id_idx" ON "workers"("farm_id");
CREATE UNIQUE INDEX "workers_tenant_id_farm_id_codigo_interno_key" ON "workers"("tenant_id", "farm_id", "codigo_interno");

-- CreateIndex
CREATE INDEX "lots_tenant_id_idx" ON "lots"("tenant_id");
CREATE INDEX "lots_farm_id_idx" ON "lots"("farm_id");
CREATE UNIQUE INDEX "lots_farm_id_nombre_lote_key" ON "lots"("farm_id", "nombre_lote");

-- CreateIndex
CREATE INDEX "containers_tenant_id_idx" ON "containers"("tenant_id");
CREATE UNIQUE INDEX "containers_tenant_id_nombre_key" ON "containers"("tenant_id", "nombre");

-- CreateIndex
CREATE INDEX "qualities_tenant_id_idx" ON "qualities"("tenant_id");
CREATE UNIQUE INDEX "qualities_tenant_id_nombre_key" ON "qualities"("tenant_id", "nombre");

-- CreateIndex
CREATE INDEX "harvest_records_tenant_id_idx" ON "harvest_records"("tenant_id");
CREATE INDEX "harvest_records_tenant_id_fecha_idx" ON "harvest_records"("tenant_id", "fecha");
CREATE INDEX "harvest_records_tenant_id_farm_id_idx" ON "harvest_records"("tenant_id", "farm_id");
CREATE INDEX "harvest_records_worker_id_idx" ON "harvest_records"("worker_id");
CREATE INDEX "harvest_records_lot_id_idx" ON "harvest_records"("lot_id");

-- CreateIndex
CREATE INDEX "harvest_record_containers_harvest_record_id_idx" ON "harvest_record_containers"("harvest_record_id");

-- CreateIndex
CREATE INDEX "tenant_module_field_config_tenant_id_idx" ON "tenant_module_field_config"("tenant_id");
CREATE UNIQUE INDEX "tenant_module_field_config_tenant_id_module_name_field_name_key" ON "tenant_module_field_config"("tenant_id", "module_name", "field_name");

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workers" ADD CONSTRAINT "workers_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots" ADD CONSTRAINT "lots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lots" ADD CONSTRAINT "lots_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "containers" ADD CONSTRAINT "containers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualities" ADD CONSTRAINT "qualities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_quality_id_fkey" FOREIGN KEY ("quality_id") REFERENCES "qualities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_record_containers" ADD CONSTRAINT "harvest_record_containers_harvest_record_id_fkey" FOREIGN KEY ("harvest_record_id") REFERENCES "harvest_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "harvest_record_containers" ADD CONSTRAINT "harvest_record_containers_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_module_field_config" ADD CONSTRAINT "tenant_module_field_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
