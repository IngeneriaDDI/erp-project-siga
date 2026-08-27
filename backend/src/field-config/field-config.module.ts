import { Module } from '@nestjs/common';
import { FieldConfigController } from './field-config.controller';
import { FieldConfigService } from './field-config.service';

@Module({
  controllers: [FieldConfigController],
  providers: [FieldConfigService],
  exports: [FieldConfigService],
})
export class FieldConfigModule {}
