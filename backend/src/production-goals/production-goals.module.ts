import { Module } from '@nestjs/common';
import { ProductionGoalsController } from './production-goals.controller';
import { ProductionGoalsService } from './production-goals.service';
import { GoalsImportService } from './goals-import.service';

@Module({
  controllers: [ProductionGoalsController],
  providers: [ProductionGoalsService, GoalsImportService],
  exports: [ProductionGoalsService],
})
export class ProductionGoalsModule {}
