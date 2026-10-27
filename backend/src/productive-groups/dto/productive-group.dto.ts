import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Status } from '@prisma/client';

export class CreateProductiveGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre!: string;

  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}

export class UpdateProductiveGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  nombre?: string;
}

export class QueryProductiveGroupDto {
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}
