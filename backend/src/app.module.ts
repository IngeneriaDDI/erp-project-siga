import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { FarmsModule } from './farms/farms.module';
import { WorkersModule } from './workers/workers.module';
import { LotsModule } from './lots/lots.module';
import { ContainersModule } from './containers/containers.module';
import { QualitiesModule } from './qualities/qualities.module';
import { FieldConfigModule } from './field-config/field-config.module';
import { HarvestModule } from './harvest/harvest.module';
import { DocumentsModule } from './documents/documents.module';
import { HarvestRemissionsModule } from './harvest-remissions/harvest-remissions.module';
import { ProductionOrdersModule } from './production-orders/production-orders.module';
import { OperationalModule } from './operational/operational.module';
import { PermissionsCatalogModule } from './permissions/permissions.module';
import { HarvestImportModule } from './harvest-import/harvest-import.module';
import { MastersImportModule } from './masters-import/masters-import.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    FarmsModule,
    WorkersModule,
    LotsModule,
    ContainersModule,
    QualitiesModule,
    FieldConfigModule,
    HarvestModule,
    DocumentsModule,
    HarvestRemissionsModule,
    ProductionOrdersModule,
    OperationalModule,
    PermissionsCatalogModule,
    HarvestImportModule,
    MastersImportModule,
  ],
  providers: [
    // Orden importante: autentica (JWT) → valida rol → valida permisos granulares.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
