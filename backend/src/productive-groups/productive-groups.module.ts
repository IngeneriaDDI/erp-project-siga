import { Module } from '@nestjs/common';
import { ProductiveGroupsController } from './productive-groups.controller';
import { ProductiveGroupsService } from './productive-groups.service';

@Module({
  controllers: [ProductiveGroupsController],
  providers: [ProductiveGroupsService],
})
export class ProductiveGroupsModule {}
