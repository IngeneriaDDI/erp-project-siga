import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Status } from '@prisma/client';

export class CreateVarietyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre!: string;

  // Permite crear variedades directamente como INACTIVE.
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}

export class UpdateVarietyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre?: string;
}

export class QueryVarietyDto {
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}
