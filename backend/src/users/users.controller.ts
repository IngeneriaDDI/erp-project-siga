import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  QueryUserDto,
  SetUserPermissionsDto,
  UpdateUserDto,
} from './dto/user.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { UpdateStatusDto } from '../common/dto/update-status.dto';
import { AuthUser } from '../common/types/auth.types';

// Gestión de usuarios: exclusiva del administrador global (SUPER_ADMIN).
@Roles(Role.SUPER_ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  findAll(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Query() query: QueryUserDto,
  ) {
    return this.service.findAll(actor, tenantId, query);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthUser,
    @TenantId() tenantId: string | null,
    @Body() dto: CreateUserDto,
  ) {
    return this.service.create(actor, tenantId, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.service.findOne(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.update(actor, id, dto);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.service.setStatus(actor, id, dto.status);
  }

  // Permisos granulares por usuario (cuentas operativas).
  @Get(':id/permissions')
  getPermissions(@CurrentUser() actor: AuthUser, @Param('id') id: string) {
    return this.service.getPermissions(actor, id);
  }

  @Put(':id/permissions')
  setPermissions(
    @CurrentUser() actor: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetUserPermissionsDto,
  ) {
    return this.service.setPermissions(actor, id, dto.permissions);
  }
}
