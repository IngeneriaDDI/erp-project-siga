import { Module } from '@nestjs/common';
import { HarvestRemissionsController } from './harvest-remissions.controller';
import { HarvestRemissionsService } from './harvest-remissions.service';
import { DocumentsModule } from '../documents/documents.module';
import { OperationalModule } from '../operational/operational.module';

@Module({
  imports: [DocumentsModule, OperationalModule],
  controllers: [HarvestRemissionsController],
  providers: [HarvestRemissionsService],
})
export class HarvestRemissionsModule {}
