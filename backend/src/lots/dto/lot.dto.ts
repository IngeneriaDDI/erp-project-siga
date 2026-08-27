import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Status } from '@prisma/client';

export class CreateLotDto {
  @IsUUID()
  farmId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombreLote!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  variedad!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  numeroPlantas?: number;
}

export class UpdateLotDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombreLote?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  variedad?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  numeroPlantas?: number;
}

export class QueryLotDto {
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @IsUUID()
  farmId?: string;
}
