import { Module } from '@nestjs/common';
import { HarvestController } from './harvest.controller';
import { HarvestService } from './harvest.service';
import { FieldConfigModule } from '../field-config/field-config.module';
import { OperationalModule } from '../operational/operational.module';

@Module({
  imports: [FieldConfigModule, OperationalModule],
  controllers: [HarvestController],
  providers: [HarvestService],
})
export class HarvestModule {}
