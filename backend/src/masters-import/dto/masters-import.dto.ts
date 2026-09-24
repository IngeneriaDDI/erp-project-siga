import { IsString } from 'class-validator';

export class MasterImportCsvDto {
  @IsString()
  csv!: string;
}
