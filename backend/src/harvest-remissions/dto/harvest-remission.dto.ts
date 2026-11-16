import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { RemissionStatus } from '@prisma/client';

export class RemissionPreviewQueryDto {
  @IsDateString({}, { message: 'date inválida (YYYY-MM-DD)' })
  date!: string;

  @IsUUID()
  lotId!: string;
}

export class CreateRemissionDto {
  @IsDateString({}, { message: 'date inválida (YYYY-MM-DD)' })
  date!: string;

  @IsUUID()
  lotId!: string;

  // Remisión parcial: registros elegidos. Si se omite, se incluyen TODOS los
  // registros del lote y día que aún no están en otra remisión.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  recordIds?: string[];
}

export class ListRemissionsQueryDto {
  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @IsOptional()
  @IsDateString()
  fechaHasta?: string;

  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsUUID()
  lotId?: string;

  @IsOptional()
  @IsEnum(RemissionStatus)
  status?: RemissionStatus;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsUUID()
  createdBy?: string;

  @IsOptional()
  @IsUUID()
  receivedBy?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
