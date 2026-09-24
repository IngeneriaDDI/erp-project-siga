import { IsBoolean, IsOptional, IsString } from 'class-validator';

/** El CSV se envía como texto en el cuerpo (evita multipart). */
export class ImportCsvDto {
  @IsString()
  csv!: string;

  // Solo super admin puede resolver contra maestros inactivos (modo histórico).
  @IsOptional()
  @IsBoolean()
  allowInactive?: boolean;

  @IsOptional()
  @IsString()
  fileName?: string;
}

export class OpenBatchDto {
  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsBoolean()
  allowInactive?: boolean;
}

export class CloseBatchDto {
  // true → COMPLETED; false → FAILED.
  @IsOptional()
  @IsBoolean()
  success?: boolean;
}
