import { IsEnum } from 'class-validator';
import { Status } from '@prisma/client';

/** DTO compartido para activar/desactivar cualquier entidad. */
export class UpdateStatusDto {
  @IsEnum(Status, { message: 'status debe ser ACTIVE o INACTIVE' })
  status!: Status;
}
