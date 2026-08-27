import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Status } from '@prisma/client';

export class CreateContainerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre!: string;

  @IsInt({ message: 'peso_gramos debe ser un entero' })
  @Min(0, { message: 'peso_gramos no puede ser negativo' })
  pesoGramos!: number;
}

export class UpdateContainerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  pesoGramos?: number;
}

export class QueryContainerDto {
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}
