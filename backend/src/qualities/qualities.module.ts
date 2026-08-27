import { Module } from '@nestjs/common';
import { QualitiesController } from './qualities.controller';
import { QualitiesService } from './qualities.service';

@Module({
  controllers: [QualitiesController],
  providers: [QualitiesService],
})
export class QualitiesModule {}
