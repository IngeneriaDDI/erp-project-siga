import { Module } from '@nestjs/common';
import { ProductionOrdersController } from './production-orders.controller';
import { ProductionOrdersService } from './production-orders.service';
import { DocumentsModule } from '../documents/documents.module';
import { OperationalModule } from '../operational/operational.module';

@Module({
  imports: [DocumentsModule, OperationalModule],
  controllers: [ProductionOrdersController],
  providers: [ProductionOrdersService],
})
export class ProductionOrdersModule {}
