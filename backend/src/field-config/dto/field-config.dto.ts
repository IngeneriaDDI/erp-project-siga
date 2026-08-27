import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { HARVEST_CONFIGURABLE_FIELDS } from '../../common/constants/harvest-fields';

export class FieldConfigItemDto {
  @IsIn(HARVEST_CONFIGURABLE_FIELDS as unknown as string[], {
    message: 'fieldName no es un campo configurable de cosecha',
  })
  fieldName!: string;

  @IsBoolean()
  isVisible!: boolean;

  @IsBoolean()
  isRequired!: boolean;
}

export class UpdateHarvestFieldConfigDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FieldConfigItemDto)
  items!: FieldConfigItemDto[];
}
