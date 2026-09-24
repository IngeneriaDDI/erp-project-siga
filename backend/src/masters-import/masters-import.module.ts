import { Module } from '@nestjs/common';
import { MastersImportController } from './masters-import.controller';
import { MastersImportService } from './masters-import.service';

@Module({
  controllers: [MastersImportController],
  providers: [MastersImportService],
})
export class MastersImportModule {}
