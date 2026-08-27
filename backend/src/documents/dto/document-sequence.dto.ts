import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DocumentType } from '@prisma/client';

export class CreateDocumentSequenceDto {
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @IsString()
  @MinLength(1)
  @MaxLength(10)
  prefix!: string;

  @IsOptional()
  @IsUUID()
  farmId?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(3000)
  year?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  paddingLength?: number;

  // Número inicial: el próximo documento será currentNumber + 1.
  @IsOptional()
  @IsInt()
  @Min(0)
  currentNumber?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateDocumentSequenceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  prefix?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  paddingLength?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  currentNumber?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
