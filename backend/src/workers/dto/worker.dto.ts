import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Status } from '@prisma/client';

export class CreateWorkerDto {
  @IsUUID()
  farmId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  codigoInterno!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  documento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaTrabajo?: string;
}

export class UpdateWorkerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  codigoInterno?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  documento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  areaTrabajo?: string;
}

export class QueryWorkerDto {
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @IsUUID()
  farmId?: string;
}
