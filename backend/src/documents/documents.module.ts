import { Module } from '@nestjs/common';
import { DocumentSequenceService } from './document-sequence.service';
import { DocumentSequenceController } from './document-sequence.controller';
import { DocumentEventService } from './document-event.service';
import { HarvestAggregationService } from './harvest-aggregation.service';

@Module({
  controllers: [DocumentSequenceController],
  providers: [DocumentSequenceService, DocumentEventService, HarvestAggregationService],
  exports: [DocumentSequenceService, DocumentEventService, HarvestAggregationService],
})
export class DocumentsModule {}
