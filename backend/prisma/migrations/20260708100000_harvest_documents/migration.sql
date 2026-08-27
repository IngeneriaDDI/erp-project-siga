-- ==========================================================================
-- Documentos de cosecha: Remisiones y Órdenes de Producción
-- ==========================================================================

-- CreateEnum
CREATE TYPE "RemissionStatus" AS ENUM ('PENDIENTE_RECEPCION', 'RECIBIDA', 'ANULADA');
CREATE TYPE "ProductionOrderStatus" AS ENUM ('PENDIENTE_ACEPTACION', 'ACEPTADA', 'ANULADA');
CREATE TYPE "DocumentType" AS ENUM ('REMISSION', 'PRODUCTION_ORDER');
CREATE TYPE "DocumentEventType" AS ENUM ('CREATED', 'RECEIVED', 'ACCEPTED', 'DUPLICATE_ATTEMPT', 'STATUS_CHANGE');

-- CreateTable
CREATE TABLE "harvest_remissions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "document_number" TEXT NOT NULL,
    "status" "RemissionStatus" NOT NULL DEFAULT 'PENDIENTE_RECEPCION',
    "total_peso_gramos" INTEGER NOT NULL,
    "total_canastillas" INTEGER NOT NULL,
    "registros_incluidos" INTEGER NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" TEXT,
    "received_at" TIMESTAMP(3),
    "received_peso_gramos" INTEGER,
    "received_canastillas" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "harvest_remissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_remission_details" (
    "id" TEXT NOT NULL,
    "remission_id" TEXT NOT NULL,
    "quality_id" TEXT NOT NULL,
    "peso_gramos" INTEGER NOT NULL,
    "canastillas" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "harvest_remission_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_remission_sources" (
    "id" TEXT NOT NULL,
    "remission_id" TEXT NOT NULL,
    "harvest_record_id" TEXT NOT NULL,
    "peso_gramos_snapshot" INTEGER NOT NULL,
    "canastillas_snapshot" INTEGER NOT NULL,
    "quality_id_snapshot" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "harvest_remission_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "farm_id" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "document_number" TEXT NOT NULL,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'PENDIENTE_ACEPTACION',
    "total_peso_gramos" INTEGER NOT NULL,
    "total_canastillas" INTEGER NOT NULL,
    "lotes_incluidos" INTEGER NOT NULL,
    "registros_incluidos" INTEGER NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_by" TEXT,
    "accepted_at" TIMESTAMP(3),
    "accepted_peso_gramos" INTEGER,
    "accepted_canastillas" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order_quality_details" (
    "id" TEXT NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "quality_id" TEXT NOT NULL,
    "peso_gramos" INTEGER NOT NULL,
    "canastillas" INTEGER NOT NULL,
    CONSTRAINT "production_order_quality_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order_lot_details" (
    "id" TEXT NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "peso_gramos" INTEGER NOT NULL,
    "canastillas" INTEGER NOT NULL,
    CONSTRAINT "production_order_lot_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order_sources" (
    "id" TEXT NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "harvest_record_id" TEXT NOT NULL,
    "peso_gramos_snapshot" INTEGER NOT NULL,
    "canastillas_snapshot" INTEGER NOT NULL,
    "lot_id_snapshot" TEXT NOT NULL,
    "quality_id_snapshot" TEXT NOT NULL,
    CONSTRAINT "production_order_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order_remissions" (
    "id" TEXT NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "remission_id" TEXT NOT NULL,
    CONSTRAINT "production_order_remissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "farm_id" TEXT,
    "prefix" TEXT NOT NULL,
    "year" INTEGER,
    "current_number" INTEGER NOT NULL DEFAULT 0,
    "padding_length" INTEGER NOT NULL DEFAULT 6,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "document_id" TEXT NOT NULL,
    "event" "DocumentEventType" NOT NULL,
    "previous_status" TEXT,
    "new_status" TEXT,
    "user_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_events_pkey" PRIMARY KEY ("id")
);

-- Índices y únicos: remisiones
CREATE UNIQUE INDEX "harvest_remissions_tenant_id_document_number_key" ON "harvest_remissions"("tenant_id", "document_number");
CREATE INDEX "harvest_remissions_tenant_id_idx" ON "harvest_remissions"("tenant_id");
CREATE INDEX "harvest_remissions_tenant_id_fecha_idx" ON "harvest_remissions"("tenant_id", "fecha");
CREATE INDEX "harvest_remissions_tenant_id_farm_id_idx" ON "harvest_remissions"("tenant_id", "farm_id");
CREATE INDEX "harvest_remissions_status_idx" ON "harvest_remissions"("status");
-- Una sola remisión activa por (tenant, fecha, lote)
CREATE UNIQUE INDEX "harvest_remissions_active_unique" ON "harvest_remissions"("tenant_id", "fecha", "lot_id") WHERE "status" <> 'ANULADA';

CREATE INDEX "harvest_remission_details_remission_id_idx" ON "harvest_remission_details"("remission_id");
CREATE UNIQUE INDEX "harvest_remission_sources_remission_id_harvest_record_id_key" ON "harvest_remission_sources"("remission_id", "harvest_record_id");
CREATE INDEX "harvest_remission_sources_harvest_record_id_idx" ON "harvest_remission_sources"("harvest_record_id");

-- Índices y únicos: órdenes
CREATE UNIQUE INDEX "production_orders_tenant_id_document_number_key" ON "production_orders"("tenant_id", "document_number");
CREATE INDEX "production_orders_tenant_id_idx" ON "production_orders"("tenant_id");
CREATE INDEX "production_orders_tenant_id_fecha_idx" ON "production_orders"("tenant_id", "fecha");
CREATE INDEX "production_orders_tenant_id_farm_id_idx" ON "production_orders"("tenant_id", "farm_id");
CREATE INDEX "production_orders_status_idx" ON "production_orders"("status");
-- Una sola orden activa por (tenant, fecha, finca)
CREATE UNIQUE INDEX "production_orders_active_unique" ON "production_orders"("tenant_id", "fecha", "farm_id") WHERE "status" <> 'ANULADA';

CREATE INDEX "production_order_quality_details_production_order_id_idx" ON "production_order_quality_details"("production_order_id");
CREATE INDEX "production_order_lot_details_production_order_id_idx" ON "production_order_lot_details"("production_order_id");
CREATE UNIQUE INDEX "production_order_sources_order_record_key" ON "production_order_sources"("production_order_id", "harvest_record_id");
CREATE INDEX "production_order_sources_harvest_record_id_idx" ON "production_order_sources"("harvest_record_id");
CREATE UNIQUE INDEX "production_order_remissions_order_remission_key" ON "production_order_remissions"("production_order_id", "remission_id");
CREATE INDEX "production_order_remissions_remission_id_idx" ON "production_order_remissions"("remission_id");

-- Consecutivos: una sola serie por (tenant, tipo, finca, año) tratando NULL como valor
CREATE UNIQUE INDEX "document_sequences_scope_key" ON "document_sequences"("tenant_id", "document_type", COALESCE("farm_id", ''), COALESCE("year", 0));
CREATE INDEX "document_sequences_tenant_id_idx" ON "document_sequences"("tenant_id");

CREATE INDEX "document_events_tenant_id_document_type_document_id_idx" ON "document_events"("tenant_id", "document_type", "document_id");

-- Foreign keys: remisiones
ALTER TABLE "harvest_remissions" ADD CONSTRAINT "harvest_remissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "harvest_remissions" ADD CONSTRAINT "harvest_remissions_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "harvest_remissions" ADD CONSTRAINT "harvest_remissions_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "harvest_remissions" ADD CONSTRAINT "harvest_remissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "harvest_remissions" ADD CONSTRAINT "harvest_remissions_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "harvest_remission_details" ADD CONSTRAINT "harvest_remission_details_remission_id_fkey" FOREIGN KEY ("remission_id") REFERENCES "harvest_remissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "harvest_remission_details" ADD CONSTRAINT "harvest_remission_details_quality_id_fkey" FOREIGN KEY ("quality_id") REFERENCES "qualities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "harvest_remission_sources" ADD CONSTRAINT "harvest_remission_sources_remission_id_fkey" FOREIGN KEY ("remission_id") REFERENCES "harvest_remissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "harvest_remission_sources" ADD CONSTRAINT "harvest_remission_sources_harvest_record_id_fkey" FOREIGN KEY ("harvest_record_id") REFERENCES "harvest_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Foreign keys: órdenes
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "production_order_quality_details" ADD CONSTRAINT "poqd_order_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_order_quality_details" ADD CONSTRAINT "poqd_quality_fkey" FOREIGN KEY ("quality_id") REFERENCES "qualities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_order_lot_details" ADD CONSTRAINT "pold_order_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_order_lot_details" ADD CONSTRAINT "pold_lot_fkey" FOREIGN KEY ("lot_id") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_order_sources" ADD CONSTRAINT "pos_order_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_order_sources" ADD CONSTRAINT "pos_record_fkey" FOREIGN KEY ("harvest_record_id") REFERENCES "harvest_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_order_sources" ADD CONSTRAINT "pos_lot_fkey" FOREIGN KEY ("lot_id_snapshot") REFERENCES "lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production_order_sources" ADD CONSTRAINT "pos_quality_fkey" FOREIGN KEY ("quality_id_snapshot") REFERENCES "qualities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "production_order_remissions" ADD CONSTRAINT "por_order_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_order_remissions" ADD CONSTRAINT "por_remission_fkey" FOREIGN KEY ("remission_id") REFERENCES "harvest_remissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Foreign keys: consecutivos y auditoría
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "document_events" ADD CONSTRAINT "document_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
