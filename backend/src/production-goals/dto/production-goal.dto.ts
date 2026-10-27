import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class GoalMonthDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  // kg por planta; se acepta coma o punto decimal, por eso se recibe como texto/número.
  @IsDefined()
  kgPerPlant!: string | number;
}

export class SaveGoalsDto {
  @IsUUID()
  lotId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsArray()
  @ArrayMinSize(12)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => GoalMonthDto)
  months!: GoalMonthDto[];
}

export class UpdateGoalsDto {
  @IsArray()
  @ArrayMinSize(12)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => GoalMonthDto)
  months!: GoalMonthDto[];
}

export class QueryGoalsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  // Texto: número de lote o nombre de finca.
  @IsOptional()
  @IsString()
  search?: string;
}
