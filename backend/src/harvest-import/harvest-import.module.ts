import { Module } from '@nestjs/common';
import { HarvestImportController } from './harvest-import.controller';
import { HarvestImportService } from './harvest-import.service';
import { HarvestImportExportService } from './harvest-import-export.service';
import { ReferenceDictionaryService } from './reference-dictionary.service';

@Module({
  controllers: [HarvestImportController],
  providers: [HarvestImportService, HarvestImportExportService, ReferenceDictionaryService],
})
export class HarvestImportModule {}
