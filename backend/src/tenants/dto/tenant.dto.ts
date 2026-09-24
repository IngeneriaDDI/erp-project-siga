import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IdentityStrategy, Status, WeightUnit } from '@prisma/client';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nit?: string;

  @IsOptional()
  @IsEnum(WeightUnit)
  weightUnit?: WeightUnit;

  // Estrategia de identidad de la empresa (nominativa / cuentas operativas / híbrida).
  @IsOptional()
  @IsEnum(IdentityStrategy)
  identityStrategy?: IdentityStrategy;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nit?: string;

  // Unidad de peso de presentación/entrada de la empresa.
  @IsOptional()
  @IsEnum(WeightUnit)
  weightUnit?: WeightUnit;

  // Estrategia de identidad de la empresa (nominativa / cuentas operativas / híbrida).
  @IsOptional()
  @IsEnum(IdentityStrategy)
  identityStrategy?: IdentityStrategy;

  // Canastilla por defecto para el registro de cosecha (null la desactiva).
  @IsOptional()
  @IsString()
  defaultContainerId?: string | null;

  // Si false, el selector de trabajadores no se filtra por finca.
  @IsOptional()
  @IsBoolean()
  workersFilteredByFarm?: boolean;
}

export class QueryTenantDto {
  @IsOptional()
  @IsEnum(Status)
  status?: Status;
}
