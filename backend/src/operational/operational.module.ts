import { Module } from '@nestjs/common';
import { OperationalController } from './operational.controller';
import { OperationalAssignmentService } from './operational-assignment.service';
import { OperationalIdentityService } from './operational-identity.service';

@Module({
  controllers: [OperationalController],
  providers: [OperationalAssignmentService, OperationalIdentityService],
  exports: [OperationalIdentityService],
})
export class OperationalModule {}
