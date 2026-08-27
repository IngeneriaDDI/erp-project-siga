import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { DocumentSequenceService } from './document-sequence.service';
import {
  CreateDocumentSequenceDto,
  UpdateDocumentSequenceDto,
} from './dto/document-sequence.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';

// Configuración de consecutivos: solo el administrador global.
@Roles(Role.SUPER_ADMIN)
@Controller('document-sequences')
export class DocumentSequenceController {
  constructor(private readonly service: DocumentSequenceService) {}

  @Get()
  list(@TenantId() tenantId: string | null) {
    return this.service.listConfig(tenantId);
  }

  @Post()
  create(@TenantId() tenantId: string | null, @Body() dto: CreateDocumentSequenceDto) {
    return this.service.createConfig(tenantId, dto);
  }

  @Patch(':id')
  update(
    @TenantId() tenantId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentSequenceDto,
  ) {
    return this.service.updateConfig(tenantId, id, dto);
  }
}
