import { IsBoolean, IsEnum, IsUUID } from 'class-validator';
import { OperationalContext } from '@prisma/client';

export class AssignWorkerDto {
  @IsEnum(OperationalContext)
  context!: OperationalContext;

  @IsUUID()
  workerId!: string;
}

export class SetPositionConfigDto {
  @IsEnum(OperationalContext)
  context!: OperationalContext;

  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  requiresAssignedWorker!: boolean;
}
