import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OperationalContext, Role, Status } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre!: string;

  @IsEmail({}, { message: 'Email inválido' })
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string;

  @IsEnum(Role)
  role!: Role;

  // Si se define, la cuenta es una CUENTA OPERATIVA COMPARTIDA de ese contexto.
  @IsOptional()
  @IsEnum(OperationalContext)
  operationalContext?: OperationalContext | null;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(OperationalContext)
  operationalContext?: OperationalContext | null;
}

// Reemplaza el conjunto de permisos efectivos de un usuario (override).
// Lista vacía => vuelve a usar la plantilla del rol.
export class SetUserPermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions!: string[];
}

export class QueryUserDto {
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
