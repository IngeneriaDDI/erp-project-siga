import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ProductionOrderStatus } from '@prisma/client';

export class OrderPreviewQueryDto {
  @IsDateString({}, { message: 'date inválida (YYYY-MM-DD)' })
  date!: string;

  @IsUUID()
  farmId!: string;
}

export class CreateOrderDto {
  @IsDateString({}, { message: 'date inválida (YYYY-MM-DD)' })
  date!: string;

  @IsUUID()
  farmId!: string;
}

export class ListOrdersQueryDto {
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
  @IsEnum(ProductionOrderStatus)
  status?: ProductionOrderStatus;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsUUID()
  createdBy?: string;

  @IsOptional()
  @IsUUID()
  acceptedBy?: string;

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
