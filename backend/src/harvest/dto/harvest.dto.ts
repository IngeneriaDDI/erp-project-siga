import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { HarvestStatus } from '@prisma/client';

export class HarvestContainerRowDto {
  @IsUUID()
  containerId!: string;

  @IsInt({ message: 'unidades debe ser un entero' })
  @Min(1, { message: 'unidades debe ser mayor que cero' })
  unidades!: number;
}

/** Payload de creación/edición de un registro de cosecha (reemplazo completo). */
export class SaveHarvestRecordDto {
  @IsUUID()
  farmId!: string;

  @IsDateString({}, { message: 'fecha inválida (formato YYYY-MM-DD)' })
  fecha!: string;

  @IsUUID()
  workerId!: string;

  @IsUUID()
  qualityId!: string;

  @IsUUID()
  lotId!: string;

  @IsInt({ message: 'peso_bruto_gramos debe ser un entero' })
  @Min(1, { message: 'el peso bruto debe ser mayor que cero' })
  pesoBrutoGramos!: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'debe incluir al menos un recipiente' })
  @ValidateNested({ each: true })
  @Type(() => HarvestContainerRowDto)
  containers!: HarvestContainerRowDto[];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  primeraFila?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  ultimaFila?: string;

  // Campo booleano: ¿la fruta presenta estado "roja"? (true / false / null)
  @IsOptional()
  @IsBoolean()
  estadoRoja?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}

export class QueryHarvestDto {
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
  workerId?: string;

  @IsOptional()
  @IsUUID()
  lotId?: string;

  @IsOptional()
  @IsUUID()
  qualityId?: string;

  @IsOptional()
  @IsEnum(HarvestStatus)
  status?: HarvestStatus;

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
