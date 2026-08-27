import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Status } from '@prisma/client';

export class CreateFarmDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ubicacion?: string;
}

export class UpdateFarmDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ubicacion?: string;
}

export class QueryFarmDto {
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}
